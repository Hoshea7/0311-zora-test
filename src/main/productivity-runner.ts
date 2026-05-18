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
  getSessionWorkingDirectory,
  loadMessages,
} from "./session-store";
import {
  formatDurationMs,
  logAgentEvent,
  logAgentLoopEnd,
  logAgentLoopStart,
} from "./agent-loop-log";
import { buildZoraPrompt } from "./prompts/zora-dynamic-context";

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

type ProductivityProfile = Awaited<ReturnType<typeof buildProductivityProfile>>;

type BuildRunProfileParams = {
  prompt: string;
  workspaceId: string;
  workingDirectory: string;
  sdkRuntime: ReturnType<typeof getSDKRuntimeOptions>;
  forwardEvent: (payload: AgentStreamEvent) => void;
  isFirstTurn: boolean;
  sdkSessionId?: string;
  localSessionId: string;
  permissionMode: "default" | "bypassPermissions";
  providerId?: string;
  selectedModelId?: string;
};

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
  profile: ProductivityProfile,
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

async function buildRunProfile({
  prompt,
  workspaceId,
  workingDirectory,
  sdkRuntime,
  forwardEvent,
  isFirstTurn,
  sdkSessionId,
  localSessionId,
  permissionMode,
  providerId,
  selectedModelId,
}: BuildRunProfileParams): Promise<ProductivityProfile> {
  logAgentEvent("pre", "context:start", "动态加载 Agent 上下文中", {
    workspace: workspaceId,
    cwd: workingDirectory,
  });
  const userPrompt = await buildZoraPrompt(prompt, workspaceId, workingDirectory);
  logAgentEvent("pre", "context:done", "动态 Agent 上下文已生成", {
    promptChars: userPrompt.length,
  });

  const profile = await buildProductivityProfile({
    userPrompt,
    cwd: workingDirectory,
    sdkRuntime,
    onEvent: forwardEvent,
    isFirstTurn,
    sessionId: sdkSessionId,
    localSessionId,
    providerId,
    selectedModelId,
  });
  applyPermissionMode(profile, permissionMode);
  return profile;
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
  const loopStartedAt = Date.now();
  let loopStatus: "success" | "error" = "success";
  logAgentLoopStart("ProductivityAgent", {
    query: text.trim(),
    session: sessionId,
    source,
    workspace: workspaceId,
  });

  try {
    const sdkRuntime = getSDKRuntimeOptions();
    const currentPrompt = text.trim();
    const existingSDKSessionId = await getSdkSessionId(sessionId, workspaceId);
    const workingDirectory = await getSessionWorkingDirectory(sessionId, workspaceId);
    const persistedMessages = existingSDKSessionId
      ? []
      : await loadMessages(sessionId, workspaceId);
    const shouldRecoverFromTranscript =
      !existingSDKSessionId && persistedMessages.length > 1;
    const initialPrompt = shouldRecoverFromTranscript
      ? buildRecoveredPromptFromMessages(persistedMessages, currentPrompt)
      : currentPrompt;

    if (shouldRecoverFromTranscript) {
      logAgentEvent("pre", "recover", "本地历史恢复上下文", {
        reason: "local_transcript_without_sdk_session",
        persistedMessages: persistedMessages.length,
      });
    }

    const profile = await buildRunProfile({
      prompt: initialPrompt,
      workspaceId,
      workingDirectory,
      sdkRuntime,
      forwardEvent,
      isFirstTurn: !existingSDKSessionId && !shouldRecoverFromTranscript,
      localSessionId: sessionId,
      sdkSessionId: existingSDKSessionId,
      permissionMode,
      providerId,
      selectedModelId,
    });

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

      logAgentEvent("pre", "recover", "本地历史恢复上下文", {
        reason: "stored_sdk_session_unavailable",
        sdkSessionId: existingSDKSessionId,
      });

      await clearSdkSessionId(sessionId, workspaceId);
      const recoveredMessages =
        persistedMessages.length > 0
          ? persistedMessages
          : await loadMessages(sessionId, workspaceId);
      const rebuiltPrompt = buildRecoveredPromptFromMessages(
        recoveredMessages,
        currentPrompt
      );
      const recoveredProfile = await buildRunProfile({
        prompt: rebuiltPrompt,
        workspaceId,
        workingDirectory,
        sdkRuntime,
        forwardEvent,
        isFirstTurn: false,
        localSessionId: sessionId,
        permissionMode,
        providerId,
        selectedModelId,
      });

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
        logAgentEvent("runtime", "queue:replay:stop", "队列补跑停止", {
          maxRuns: LATE_QUEUE_FOLLOW_UP_MAX_RUNS,
        });
        break;
      }

      const followUpPrompt = buildLateQueuedPrompt(runResult.lateQueuedMessages);
      if (!followUpPrompt.trim()) {
        break;
      }

      const resumeSessionId =
        runResult.sdkSessionId ?? await getSdkSessionId(sessionId, workspaceId);
      logAgentEvent("runtime", "queue:replay:start", "队列补跑开始", {
        messages: runResult.lateQueuedMessages.length,
        resume: Boolean(resumeSessionId),
        sdkSessionId: resumeSessionId,
      });

      const followUpProfile = await buildRunProfile({
        prompt: followUpPrompt,
        workspaceId,
        workingDirectory,
        sdkRuntime,
        forwardEvent,
        isFirstTurn: false,
        localSessionId: sessionId,
        sdkSessionId: resumeSessionId,
        permissionMode,
        providerId,
        selectedModelId,
      });

      runResult = await runAgentWithProfile(
        sessionId,
        followUpProfile,
        forwardEvent,
        undefined,
        workspaceId,
        source
      );
    }
  } catch (error) {
    loopStatus = "error";
    throw error;
  } finally {
    logAgentLoopEnd("ProductivityAgent", {
      status: loopStatus,
      totalDuration: formatDurationMs(Date.now() - loopStartedAt),
      session: sessionId,
      workspace: workspaceId,
    });
  }
}
