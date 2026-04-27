import type {
  AgentRunSource,
  AgentStreamEvent,
  ConversationMessage,
  FileAttachment,
} from "../shared/zora";
import {
  type AgentRunResult,
  MissingSdkSessionError,
  type QueuedAgentMessage,
  runAgentWithProfile,
} from "./agent";
import { buildProductivityProfile } from "./query-profiles";
import { getSDKRuntimeOptions } from "./sdk-runtime";
import {
  clearSdkSessionId,
  getSdkSessionId,
  loadMessages,
} from "./session-store";
import { getWorkspacePath } from "./workspace-store";

const RECOVERY_MAX_MESSAGES = 80;
const RECOVERY_MAX_TRANSCRIPT_CHARS = 100_000;
const RECOVERY_MAX_TOOL_IO_CHARS = 4_000;
const LATE_QUEUE_FOLLOW_UP_MAX_RUNS = 20;

export interface RunProductivitySessionParams {
  sessionId: string;
  text: string;
  forwardEvent: (payload: AgentStreamEvent) => void;
  workspaceId?: string;
  attachments?: FileAttachment[];
  permissionMode?: "default" | "bypassPermissions";
  source?: AgentRunSource;
  providerId?: string;
  selectedModelId?: string;
}

function truncateForRecovery(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars)}\n...[truncated]`;
}

function serializeMessageForRecovery(message: ConversationMessage): string[] {
  if (message.role === "user") {
    const text = message.text?.trim() ?? "";
    return text ? [`User: ${text}`] : [];
  }

  const turn = message.turn;
  if (!turn) {
    return [];
  }

  const sections: string[] = [];
  const bodyText = turn.bodySegments
    .map((segment) => segment.text.trim())
    .filter(Boolean)
    .join("\n\n");

  if (bodyText) {
    sections.push(`Assistant: ${bodyText}`);
  }

  for (const step of turn.processSteps) {
    if (step.type !== "tool") {
      continue;
    }

    sections.push(
      `Assistant used tool ${step.tool.name} with input:\n${truncateForRecovery(
        step.tool.input || "(empty input)",
        RECOVERY_MAX_TOOL_IO_CHARS
      )}`
    );

    if (step.tool.result) {
      sections.push(
        `Tool result from ${step.tool.name}:\n${truncateForRecovery(
          step.tool.result,
          RECOVERY_MAX_TOOL_IO_CHARS
        )}`
      );
    }
  }

  return sections;
}

function buildRecoveredPromptFromMessages(
  messages: ConversationMessage[],
  fallbackUserPrompt: string
): string {
  const transcriptSections: string[] = [];
  let transcriptLength = 0;

  for (const message of messages.slice(-RECOVERY_MAX_MESSAGES)) {
    for (const section of serializeMessageForRecovery(message)) {
      if (transcriptLength + section.length > RECOVERY_MAX_TRANSCRIPT_CHARS) {
        transcriptSections.push("[Earlier transcript truncated for length.]");
        transcriptLength = RECOVERY_MAX_TRANSCRIPT_CHARS;
        break;
      }

      transcriptSections.push(section);
      transcriptLength += section.length + 2;
    }

    if (transcriptLength >= RECOVERY_MAX_TRANSCRIPT_CHARS) {
      break;
    }
  }

  const transcript =
    transcriptSections.length > 0
      ? transcriptSections.join("\n\n")
      : `User: ${fallbackUserPrompt}`;

  return [
    "The previous Claude Code session for this local Zora conversation is unavailable.",
    "Resume the conversation from the locally persisted transcript below.",
    "Treat the transcript as authoritative history for this conversation.",
    "Continue naturally from the final user message without mentioning recovery unless the user asks.",
    "Conversation transcript:",
    transcript,
  ].join("\n\n");
}

function applyPermissionMode(
  profile: Awaited<ReturnType<typeof buildProductivityProfile>>,
  permissionMode: "default" | "bypassPermissions"
): void {
  profile.options.permissionMode = permissionMode;

  if (permissionMode === "bypassPermissions") {
    delete profile.options.canUseTool;
  }
}

function buildLateQueuedPrompt(messages: QueuedAgentMessage[]): string {
  if (messages.length === 1) {
    return messages[0]?.text ?? "";
  }

  return messages
    .map((message, index) => `Queued message ${index + 1}:\n${message.text}`)
    .join("\n\n");
}

export async function runProductivitySession({
  sessionId,
  text,
  forwardEvent,
  workspaceId = "default",
  attachments,
  permissionMode = "default",
  source = "desktop",
  providerId,
  selectedModelId,
}: RunProductivitySessionParams): Promise<void> {
  const sdkRuntime = getSDKRuntimeOptions();
  const currentPrompt = text.trim();
  const existingSDKSessionId = await getSdkSessionId(sessionId, workspaceId);
  const workspacePath = await getWorkspacePath(workspaceId);
  const persistedMessages = existingSDKSessionId
    ? []
    : await loadMessages(sessionId, workspaceId);
  const shouldRecoverFromTranscript =
    !existingSDKSessionId && persistedMessages.length > 1;
  const initialPrompt = shouldRecoverFromTranscript
    ? buildRecoveredPromptFromMessages(persistedMessages, currentPrompt)
    : currentPrompt;

  if (shouldRecoverFromTranscript) {
    console.warn(
      `[productivity-runner] Local session ${sessionId} has persisted history but no stored SDK session. Rebuilding context from local transcript.`
    );
  }

  const profile = await buildProductivityProfile({
    userPrompt: initialPrompt,
    cwd: workspacePath,
    sdkRuntime,
    onEvent: forwardEvent,
    isFirstTurn: !existingSDKSessionId && !shouldRecoverFromTranscript,
    sessionId: existingSDKSessionId,
    localSessionId: sessionId,
    providerId,
    selectedModelId,
  });
  applyPermissionMode(profile, permissionMode);

  let runResult: AgentRunResult;

  try {
    runResult = await runAgentWithProfile(
      sessionId,
      profile,
      forwardEvent,
      attachments,
      workspaceId,
      source
    );
  } catch (error) {
    if (!(error instanceof MissingSdkSessionError) || !existingSDKSessionId) {
      throw error;
    }

    console.warn(
      `[productivity-runner] Stored SDK session ${existingSDKSessionId} is unavailable for local session ${sessionId}. Rebuilding context from local transcript.`
    );

    await clearSdkSessionId(sessionId, workspaceId);
    const recoveredMessages =
      persistedMessages.length > 0
        ? persistedMessages
        : await loadMessages(sessionId, workspaceId);
    const rebuiltPrompt = buildRecoveredPromptFromMessages(
      recoveredMessages,
      currentPrompt
    );
    const recoveredProfile = await buildProductivityProfile({
      userPrompt: rebuiltPrompt,
      cwd: workspacePath,
      sdkRuntime,
      onEvent: forwardEvent,
      isFirstTurn: false,
      sessionId: undefined,
      localSessionId: sessionId,
      providerId,
      selectedModelId,
    });
    applyPermissionMode(recoveredProfile, permissionMode);

    runResult = await runAgentWithProfile(
      sessionId,
      recoveredProfile,
      forwardEvent,
      attachments,
      workspaceId,
      source
    );
  }

  let followUpCount = 0;
  while (runResult.lateQueuedMessages.length > 0) {
    followUpCount += 1;
    if (followUpCount > LATE_QUEUE_FOLLOW_UP_MAX_RUNS) {
      console.warn(
        `[productivity-runner] Stopped after ${LATE_QUEUE_FOLLOW_UP_MAX_RUNS} late queue follow-up run(s) for session ${sessionId}.`
      );
      break;
    }

    const followUpPrompt = buildLateQueuedPrompt(runResult.lateQueuedMessages);
    if (!followUpPrompt.trim()) {
      break;
    }

    const resumeSessionId =
      runResult.sdkSessionId ?? await getSdkSessionId(sessionId, workspaceId);
    console.log(
      `[productivity-runner] Starting late queue follow-up run for session ${sessionId} with ${runResult.lateQueuedMessages.length} message(s).`
    );

    const followUpProfile = await buildProductivityProfile({
      userPrompt: followUpPrompt,
      cwd: workspacePath,
      sdkRuntime,
      onEvent: forwardEvent,
      isFirstTurn: false,
      sessionId: resumeSessionId,
      localSessionId: sessionId,
      providerId,
      selectedModelId,
    });
    applyPermissionMode(followUpProfile, permissionMode);

    runResult = await runAgentWithProfile(
      sessionId,
      followUpProfile,
      forwardEvent,
      undefined,
      workspaceId,
      source
    );
  }
}
