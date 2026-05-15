import { randomUUID } from "node:crypto";
import type {
  AgentRunSource,
  AgentStreamEvent,
  FileAttachment,
  SessionMeta,
} from "../shared/zora";
import { resolveDefaultModelTarget } from "./default-model-settings";
import { memoryAgent } from "./memory-agent";
import { runProductivitySession } from "./productivity-runner";
import {
  appendMessageRecord,
  createSession,
  getSessionMeta,
  persistAssistantMessage,
  persistToolResults,
  saveAttachments,
  updateSessionMeta,
} from "./session-store";

type ForwardEvent = (payload: AgentStreamEvent) => void;

interface RunPromptInSessionOptions {
  sessionId: string;
  workspaceId: string;
  text: string;
  forwardEvent: ForwardEvent;
  attachments?: FileAttachment[];
  source: AgentRunSource;
  waitForCompletion?: boolean;
  beforeRun?: (session: SessionMeta) => Promise<void> | void;
}

interface RunPromptInNewSessionOptions
  extends Omit<RunPromptInSessionOptions, "sessionId"> {
  title: string;
}

export async function runPromptInSession({
  sessionId,
  workspaceId,
  text,
  forwardEvent,
  attachments,
  source,
  waitForCompletion = false,
  beforeRun,
}: RunPromptInSessionOptions): Promise<void> {
  const trimmedText = text.trim();
  if (!trimmedText) {
    throw new Error("A non-empty text is required.");
  }

  const session = await getSessionMeta(sessionId, workspaceId);
  if (!session) {
    throw new Error(`Session ${sessionId} not found.`);
  }

  let providerId = session.providerId;
  let selectedModelId = session.selectedModelId;
  const sessionUpdates: Parameters<typeof updateSessionMeta>[1] = {};

  if (!session.providerLocked) {
    const defaultTarget = await resolveDefaultModelTarget();
    if (defaultTarget) {
      providerId = defaultTarget.provider.id;
      selectedModelId = defaultTarget.selectedModelId;
      sessionUpdates.providerId = defaultTarget.provider.id;
      sessionUpdates.providerLocked = true;
      sessionUpdates.selectedModelId = defaultTarget.selectedModelId;
    }
  }

  await updateSessionMeta(sessionId, sessionUpdates, workspaceId);

  const savedAttachments =
    attachments && attachments.length > 0
      ? await saveAttachments(sessionId, attachments, workspaceId)
      : [];

  await appendMessageRecord(
    sessionId,
    {
      kind: "user",
      message: {
        id: `user-${randomUUID()}`,
        role: "user",
        text: trimmedText,
        timestamp: Date.now(),
        attachments: savedAttachments.length > 0 ? savedAttachments : undefined,
      },
    },
    workspaceId
  );
  memoryAgent.scheduleProcessing(sessionId, workspaceId);

  const updatedSession = {
    ...session,
    ...sessionUpdates,
  };
  await beforeRun?.(updatedSession);

  const runPromise = runProductivitySession({
    sessionId,
    text: trimmedText,
    forwardEvent: (payload) => {
      forwardEvent(payload);

      const message = payload as Record<string, unknown>;
      if (message.type === "assistant" && "message" in message) {
        persistAssistantMessage(sessionId, message.message, workspaceId);
      }

      if (message.type === "user" && "message" in message) {
        persistToolResults(sessionId, message.message, workspaceId);
      }
    },
    workspaceId,
    attachments,
    source,
    providerId,
    selectedModelId,
  });

  if (waitForCompletion) {
    await runPromise;
    return;
  }

  void runPromise.catch((error) => {
    console.error(`[session-runner] Agent run failed for session ${sessionId}:`, error);
  });
}

export async function runPromptInNewSession({
  title,
  workspaceId,
  ...options
}: RunPromptInNewSessionOptions): Promise<SessionMeta> {
  const session = await createSession(title, workspaceId);

  await runPromptInSession({
    ...options,
    sessionId: session.id,
    workspaceId,
  });

  return session;
}
