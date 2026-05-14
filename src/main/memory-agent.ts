import type { ConversationMessage } from "../shared/zora";
import {
  isAgentRunningForSession,
  runAgentWithProfile,
} from "./agent";
import {
  getMemorySettingsSync,
  loadMemorySettings,
} from "./memory-settings";
import { getZoraMemoryDirPath, loadFile } from "./memory-store";
import { buildMemoryProfile } from "./query-profiles";
import { getSDKRuntimeOptions } from "./sdk-runtime";
import { listSessions, loadMessages } from "./session-store";

const MEMORY_PROCESS_DEBOUNCE_MS = 10 * 60 * 1000;
const BATCH_QUEUE_MAX_SIZE = 8;
const USER_MESSAGE_MAX_CHARS = 500;
const ASSISTANT_MESSAGE_MAX_CHARS = 300;
const MEMORY_MESSAGE_LIMIT = 40;
const MEMORY_MESSAGE_HEAD = 6;
const MEMORY_MESSAGE_TAIL = 20;
const BATCH_USER_MESSAGE_MAX_CHARS = 300;
const BATCH_ASSISTANT_MESSAGE_MAX_CHARS = 200;
const BATCH_MESSAGE_LIMIT = 20;
const BATCH_MESSAGE_HEAD = 4;
const BATCH_MESSAGE_TAIL = 12;
const MEMORY_AGENT_PREFIX = "[memory-agent]";

type PendingSessionContext = {
  workspaceId: string;
  enqueuedAt: number;
};

type PendingSessionItem = {
  sessionId: string;
  context: PendingSessionContext;
};

type MemoryPromptBuildResult = {
  prompt: string;
  totalTranscriptMessages: number;
  keptTranscriptMessages: number;
  omittedTranscriptMessages: number;
};

type TranscriptLimits = {
  userMaxChars: number;
  assistantMaxChars: number;
  messageLimit: number;
  head: number;
  tail: number;
};

type SerializedTranscript = {
  visibleMessages: string[];
  totalMessages: number;
  keptMessages: number;
  omittedMessages: number;
};

const SINGLE_TRANSCRIPT_LIMITS: TranscriptLimits = {
  userMaxChars: USER_MESSAGE_MAX_CHARS,
  assistantMaxChars: ASSISTANT_MESSAGE_MAX_CHARS,
  messageLimit: MEMORY_MESSAGE_LIMIT,
  head: MEMORY_MESSAGE_HEAD,
  tail: MEMORY_MESSAGE_TAIL,
};

const BATCH_TRANSCRIPT_LIMITS: TranscriptLimits = {
  userMaxChars: BATCH_USER_MESSAGE_MAX_CHARS,
  assistantMaxChars: BATCH_ASSISTANT_MESSAGE_MAX_CHARS,
  messageLimit: BATCH_MESSAGE_LIMIT,
  head: BATCH_MESSAGE_HEAD,
  tail: BATCH_MESSAGE_TAIL,
};

function padNumber(value: number) {
  return value.toString().padStart(2, "0");
}

function formatLocalDate(date = new Date()) {
  return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;
}

function formatLocalTime(date = new Date()) {
  return `${padNumber(date.getHours())}:${padNumber(date.getMinutes())}`;
}

function truncateText(value: string, maxChars: number) {
  const trimmed = value.trim();
  if (trimmed.length <= maxChars) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxChars)}...`;
}

function logMemoryAgent(message: string) {
  console.log(`${MEMORY_AGENT_PREFIX} ${message}`);
}

function serializeMemoryMessage(
  message: ConversationMessage,
  userMaxChars = USER_MESSAGE_MAX_CHARS,
  assistantMaxChars = ASSISTANT_MESSAGE_MAX_CHARS
): string | null {
  if (message.role === "user") {
    const text = truncateText(message.text ?? "", userMaxChars);
    return text ? `**User**: ${text}` : null;
  }

  if (message.role === "assistant" && message.turn) {
    const text = truncateText(
      message.turn.bodySegments.map((segment) => segment.text).join("\n\n"),
      assistantMaxChars
    );
    return text ? `**Zora**: ${text}` : null;
  }

  return null;
}

function serializeTranscript(
  messages: ConversationMessage[],
  limits: TranscriptLimits
): SerializedTranscript {
  const serializedMessages = messages
    .map((message) =>
      serializeMemoryMessage(
        message,
        limits.userMaxChars,
        limits.assistantMaxChars
      )
    )
    .filter((message): message is string => Boolean(message));

  const visibleMessages =
    serializedMessages.length > limits.messageLimit
      ? [
          ...serializedMessages.slice(0, limits.head),
          "... (earlier exchanges omitted) ...",
          ...serializedMessages.slice(-limits.tail),
        ]
      : serializedMessages;

  return {
    visibleMessages,
    totalMessages: serializedMessages.length,
    keptMessages: visibleMessages.length,
    omittedMessages: Math.max(0, serializedMessages.length - visibleMessages.length),
  };
}

function buildMemoryStateSection(
  memoryContent: string | null,
  userContent: string | null
) {
  return [
    "## Current Memory State",
    "",
    "### MEMORY.md",
    memoryContent?.trim() || "(empty — not created yet)",
    "",
    "### USER.md",
    userContent?.trim() || "(empty — not created yet)",
  ].join("\n");
}

function buildMemoryPrompt(
  messages: ConversationMessage[],
  sessionTitle: string,
  memoryContent: string | null,
  userContent: string | null,
  conversationTime?: Date
): MemoryPromptBuildResult {
  const now = new Date();
  const effectiveTime = conversationTime ?? now;
  const transcript = serializeTranscript(messages, SINGLE_TRANSCRIPT_LIMITS);

  const memoryStateSection = buildMemoryStateSection(memoryContent, userContent);

  return {
    prompt: [
      memoryStateSection,
      "",
      "## Conversation to Process",
      "",
      `**Session**: ${sessionTitle}`,
      `**Date**: ${formatLocalDate(effectiveTime)}`,
      `**Time**: ${formatLocalTime(effectiveTime)}`,
      "",
      transcript.visibleMessages.join("\n\n"),
      "",
      "Please analyze this conversation and update memory files as needed.",
      "If nothing worth remembering happened, just write a brief daily log and finish.",
    ].join("\n"),
    totalTranscriptMessages: transcript.totalMessages,
    keptTranscriptMessages: transcript.keptMessages,
    omittedTranscriptMessages: transcript.omittedMessages,
  };
}

type BatchConversationEntry = {
  sessionTitle: string;
  messages: ConversationMessage[];
  conversationTime: Date;
};

function buildBatchMemoryPrompt(
  entries: BatchConversationEntry[],
  memoryContent: string | null,
  userContent: string | null
): MemoryPromptBuildResult {
  const sections: string[] = [];
  let totalMessages = 0;
  let keptMessages = 0;
  let omittedMessages = 0;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const transcript = serializeTranscript(entry.messages, BATCH_TRANSCRIPT_LIMITS);

    totalMessages += transcript.totalMessages;
    keptMessages += transcript.keptMessages;
    omittedMessages += transcript.omittedMessages;

    sections.push(
      [
        `### Conversation ${i + 1} of ${entries.length}`,
        "",
        `**Session**: ${entry.sessionTitle}`,
        `**Date**: ${formatLocalDate(entry.conversationTime)}`,
        `**Time**: ${formatLocalTime(entry.conversationTime)}`,
        "",
        transcript.visibleMessages.join("\n\n"),
      ].join("\n")
    );
  }

  const prompt = [
    buildMemoryStateSection(memoryContent, userContent),
    "",
    "## Batch: Multiple Conversations to Process",
    "",
    `You have **${entries.length}** conversations to analyze in this batch.`,
    "Process each one, then make a **single consolidated update** to memory files.",
    "Write a separate daily-log entry for each conversation.",
    "",
    sections.join("\n\n---\n\n"),
    "",
    "---",
    "",
    "Please analyze ALL conversations above and make consolidated memory updates.",
    "Merge related information across conversations. Avoid duplicate entries.",
    "If nothing worth remembering happened in a conversation, write only its daily log.",
  ].join("\n");

  return {
    prompt,
    totalTranscriptMessages: totalMessages,
    keptTranscriptMessages: keptMessages,
    omittedTranscriptMessages: omittedMessages,
  };
}

export class MemoryAgent {
  private readonly debounceTimers = new Map<string, NodeJS.Timeout>();
  private readonly processing = new Set<string>();
  private readonly processedMessageCounts = new Map<string, number>();
  private readonly pendingContexts = new Map<string, PendingSessionContext>();
  private batchIdleTimer: NodeJS.Timeout | null = null;
  private pendingChangeCallback?: (count: number) => void;
  private queue: Promise<void> = Promise.resolve();

  async onConversationEnd(
    sessionId: string,
    workspaceId = "default"
  ): Promise<void> {
    const messages = await loadMessages(sessionId, workspaceId);
    if (messages.length < 4) {
      this.clearDebounceTimer(sessionId);
      this.deletePendingContext(sessionId);
      logMemoryAgent(
        `Session ${sessionId} has ${messages.length} message(s), below threshold (4); not queuing.`
      );
      return;
    }

    const settings = await loadMemorySettings();

    switch (settings.mode) {
      case "manual":
        this.trackPendingSession(sessionId, workspaceId);
        this.clearDebounceTimer(sessionId);
        logMemoryAgent(
          `Conversation ended for session ${sessionId} (manual mode: stored, waiting for explicit trigger; pending: ${this.pendingContexts.size}).`
        );
        return;

      case "batch":
        this.trackPendingSession(sessionId, workspaceId);
        this.clearDebounceTimer(sessionId);
        logMemoryAgent(
          `Batch: queued session ${sessionId} (pending: ${this.pendingContexts.size}).`
        );
        if (this.pendingContexts.size >= BATCH_QUEUE_MAX_SIZE) {
          logMemoryAgent("Batch: queue full; triggering immediate batch processing.");
          this.clearBatchIdleTimer();
          void this.processPendingBatch();
        } else {
          this.resetBatchIdleTimer(settings.batchIdleMinutes);
        }
        return;

      case "immediate":
      default:
        this.trackPendingSession(sessionId, workspaceId);
        this.clearDebounceTimer(sessionId);
        logMemoryAgent(
          this.processing.has(sessionId)
            ? `Conversation ended for session ${sessionId}; queued a follow-up memory recheck after the current run.`
            : `Conversation ended for session ${sessionId}; queued memory processing.`
        );
        this.enqueueProcess(sessionId, workspaceId);
        return;
    }
  }

  scheduleProcessing(
    sessionId: string,
    workspaceId = "default"
  ): void {
    const settings = getMemorySettingsSync();

    if (settings.mode === "manual" || settings.mode === "batch") {
      return;
    }

    this.trackPendingSession(sessionId, workspaceId);
    const hadExistingTimer = this.debounceTimers.has(sessionId);
    this.clearDebounceTimer(sessionId);
    logMemoryAgent(
      `${hadExistingTimer ? "Rescheduled" : "Scheduled"} session ${sessionId} for memory processing in ${Math.floor(MEMORY_PROCESS_DEBOUNCE_MS / 1000)}s.`
    );

    const timer = setTimeout(() => {
      this.debounceTimers.delete(sessionId);

      if (isAgentRunningForSession(sessionId)) {
        logMemoryAgent(
          `Session ${sessionId} is still running when debounce fired; delaying memory processing.`
        );
        this.scheduleProcessing(sessionId, workspaceId);
        return;
      }

      logMemoryAgent(
        `Debounce window elapsed for session ${sessionId}; queued memory processing.`
      );
      this.enqueueProcess(sessionId, workspaceId);
    }, MEMORY_PROCESS_DEBOUNCE_MS);

    this.debounceTimers.set(sessionId, timer);
  }

  async flushAll(): Promise<void> {
    const settings = await loadMemorySettings();

    if (settings.mode === "manual") {
      logMemoryAgent("Flush skipped: manual mode.");
      return;
    }

    this.clearBatchIdleTimer();
    this.clearAllDebounceTimers();

    const pendingCount = this.pendingContexts.size;
    if (pendingCount === 0) {
      logMemoryAgent("Flush: no pending sessions.");
      return;
    }

    logMemoryAgent(`Flush: processing ${pendingCount} pending session(s).`);

    if (settings.mode === "batch") {
      await this.processPendingBatch();
      await this.queue;
      logMemoryAgent("Flush complete.");
      return;
    }

    for (const [sessionId, context] of this.pendingContexts) {
      if (this.processing.has(sessionId)) {
        logMemoryAgent(`Flush: session ${sessionId} already processing; skipping.`);
        continue;
      }
      this.enqueueProcess(sessionId, context.workspaceId);
    }

    await this.queue;
    logMemoryAgent("Flush complete.");
  }

  async processNow(): Promise<{ total: number; processed: number }> {
    logMemoryAgent("Manual processNow triggered.");

    this.clearBatchIdleTimer();

    this.clearAllDebounceTimers();

    const total = this.pendingContexts.size;
    if (total === 0) {
      logMemoryAgent("processNow: no pending sessions.");
      this.notifyPendingChanged();
      return { total: 0, processed: 0 };
    }

    logMemoryAgent(`processNow: ${total} pending session(s).`);
    const processed = await this.processPendingBatch();
    logMemoryAgent(`processNow complete: ${processed}/${total} sessions processed.`);
    this.notifyPendingChanged();

    return { total, processed };
  }

  setPendingChangeCallback(callback: (count: number) => void): void {
    this.pendingChangeCallback = callback;
  }

  getPendingCount(): number {
    return this.pendingContexts.size;
  }

  getStatus(): { pending: number; processing: number } {
    return {
      pending: this.pendingContexts.size,
      processing: this.processing.size,
    };
  }

  private clearDebounceTimer(sessionId: string) {
    const timer = this.debounceTimers.get(sessionId);
    if (!timer) {
      return;
    }

    clearTimeout(timer);
    this.debounceTimers.delete(sessionId);
  }

  private clearAllDebounceTimers(): void {
    for (const [, timer] of this.debounceTimers) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  private trackPendingSession(
    sessionId: string,
    workspaceId: string
  ): void {
    this.setPendingContext(sessionId, {
      workspaceId,
      enqueuedAt: Date.now(),
    });
  }

  private setPendingContext(sessionId: string, context: PendingSessionContext): void {
    const previousCount = this.pendingContexts.size;
    this.pendingContexts.set(sessionId, context);
    if (this.pendingContexts.size !== previousCount) {
      this.notifyPendingChanged();
    }
  }

  private deletePendingContext(sessionId: string): void {
    const deleted = this.pendingContexts.delete(sessionId);
    if (deleted) {
      this.notifyPendingChanged();
    }
  }

  private notifyPendingChanged(): void {
    this.pendingChangeCallback?.(this.pendingContexts.size);
  }

  private resetBatchIdleTimer(idleMinutes: number): void {
    this.clearBatchIdleTimer();
    logMemoryAgent(`Batch idle timer set: ${idleMinutes}m from now.`);
    this.batchIdleTimer = setTimeout(() => {
      this.batchIdleTimer = null;
      logMemoryAgent(
        `Batch idle timer fired after ${idleMinutes}m; processing ${this.pendingContexts.size} pending session(s).`
      );
      void this.processPendingBatch();
    }, idleMinutes * 60 * 1000);
  }

  private clearBatchIdleTimer(): void {
    if (this.batchIdleTimer) {
      clearTimeout(this.batchIdleTimer);
      this.batchIdleTimer = null;
    }
  }

  private getEligiblePendingSessions(): PendingSessionItem[] {
    const pending: PendingSessionItem[] = [];

    for (const [sessionId, context] of this.pendingContexts) {
      if (this.processing.has(sessionId)) {
        continue;
      }
      if (sessionId.startsWith("__memory_")) {
        continue;
      }
      pending.push({ sessionId, context });
    }

    return pending;
  }

  private async processPendingBatch(): Promise<number> {
    const pending = this.getEligiblePendingSessions();

    if (pending.length === 0) {
      logMemoryAgent("Batch: no eligible pending sessions.");
      return 0;
    }

    if (pending.length === 1) {
      const { sessionId, context } = pending[0];
      logMemoryAgent(`Batch: only 1 session (${sessionId}); using single-session processing.`);
      return (await this.process(sessionId, context.workspaceId)) ? 1 : 0;
    }

    const byWorkspace = new Map<string, PendingSessionItem[]>();
    for (const item of pending) {
      const group = byWorkspace.get(item.context.workspaceId);
      if (group) {
        group.push(item);
      } else {
        byWorkspace.set(item.context.workspaceId, [item]);
      }
    }

    let totalProcessed = 0;

    for (const group of byWorkspace.values()) {
      const startedAt = Date.now();
      const workspaceId = group[0].context.workspaceId;

      logMemoryAgent(
        `Batch: processing ${group.length} sessions for workspace=${workspaceId}.`
      );

      const entries: Array<{
        sessionId: string;
        entry: BatchConversationEntry;
      }> = [];

      const allSessions = await listSessions(workspaceId);

      for (const { sessionId, context } of group) {
        try {
          const messages = await loadMessages(sessionId, context.workspaceId);

          if (messages.length < 4) {
            logMemoryAgent(`Batch: skip ${sessionId} — only ${messages.length} message(s).`);
            this.deletePendingContext(sessionId);
            continue;
          }

          const lastProcessed = this.processedMessageCounts.get(sessionId);
          if (lastProcessed !== undefined && lastProcessed >= messages.length) {
            logMemoryAgent(`Batch: skip ${sessionId} — unchanged (${messages.length} msgs).`);
            this.deletePendingContext(sessionId);
            continue;
          }

          const sessionTitle =
            allSessions.find((session) => session.id === sessionId)?.title ?? "Untitled Session";

          const conversationTime = context.enqueuedAt
            ? new Date(context.enqueuedAt)
            : new Date();

          entries.push({
            sessionId,
            entry: { sessionTitle, messages, conversationTime },
          });
        } catch (error) {
          console.error(`${MEMORY_AGENT_PREFIX} Batch: failed to load ${sessionId}:`, error);
          this.deletePendingContext(sessionId);
        }
      }

      if (entries.length === 0) {
        logMemoryAgent("Batch: no eligible sessions after filtering.");
        continue;
      }

      if (entries.length === 1) {
        const { sessionId } = entries[0];
        const ctx = group.find((item) => item.sessionId === sessionId)?.context;
        if (!ctx) {
          continue;
        }
        logMemoryAgent(`Batch: 1 session survived filtering (${sessionId}); using single-session.`);
        if (await this.process(sessionId, ctx.workspaceId)) {
          totalProcessed += 1;
        }
        continue;
      }

      const memoryContent = await loadFile("MEMORY.md");
      const userContent = await loadFile("USER.md");
      logMemoryAgent(
        `Batch: loaded memory state: MEMORY.md chars=${memoryContent?.length ?? 0}, USER.md chars=${userContent?.length ?? 0}.`
      );

      const {
        prompt,
        totalTranscriptMessages,
        keptTranscriptMessages,
        omittedTranscriptMessages,
      } = buildBatchMemoryPrompt(entries.map((item) => item.entry), memoryContent, userContent);

      logMemoryAgent(
        `Batch prompt built: sessions=${entries.length}, transcript=${keptTranscriptMessages}/${totalTranscriptMessages}, omitted=${omittedTranscriptMessages}, chars=${prompt.length}.`
      );

      const batchSessionIds = entries.map((item) => item.sessionId);
      for (const sid of batchSessionIds) {
        this.processing.add(sid);
      }

      try {
        const memorySessionId = `__memory_batch_${Date.now()}__`;
        const targetZoraDir = getZoraMemoryDirPath();

        logMemoryAgent(
          `Starting batch memory run ${memorySessionId} for ${batchSessionIds.length} sessions in ${targetZoraDir}.`
        );

        const profile = await buildMemoryProfile({
          sdkRuntime: getSDKRuntimeOptions(),
          prompt,
        });

        await runAgentWithProfile(
          memorySessionId,
          profile,
          () => {},
          undefined,
          workspaceId,
          "memory"
        );

        for (const { sessionId, entry } of entries) {
          this.processedMessageCounts.set(sessionId, entry.messages.length);
        }
        totalProcessed += entries.length;

        logMemoryAgent(
          `Batch memory run complete for ${batchSessionIds.length} sessions in ${Date.now() - startedAt}ms.`
        );
      } catch (error) {
        console.error(`${MEMORY_AGENT_PREFIX} Batch processing failed:`, error);
      } finally {
        for (const sid of batchSessionIds) {
          this.processing.delete(sid);
          this.deletePendingContext(sid);
        }
      }
    }

    return totalProcessed;
  }

  private enqueueProcess(
    sessionId: string,
    workspaceId = "default"
  ) {
    this.trackPendingSession(sessionId, workspaceId);
    this.queue = this.queue
      .then(async () => {
        await this.process(sessionId, workspaceId);
      })
      .catch((error) => {
        console.error(
          `${MEMORY_AGENT_PREFIX} Queue failure for session ${sessionId}:`,
          error
        );
      });
  }

  private process(
    sessionId: string,
    workspaceId = "default"
  ): Promise<boolean> {
    if (this.processing.has(sessionId)) {
      logMemoryAgent(`Skip session ${sessionId}: processing already in progress.`);
      return Promise.resolve(false);
    }

    if (sessionId.startsWith("__memory_")) {
      logMemoryAgent(`Skip nested memory session ${sessionId}.`);
      return Promise.resolve(false);
    }

    return (async () => {
      const startedAt = Date.now();
      this.processing.add(sessionId);
      logMemoryAgent(
        `Begin processing session ${sessionId} (workspace=${workspaceId}).`
      );

      try {
        const messages = await loadMessages(sessionId, workspaceId);
        logMemoryAgent(
          `Loaded ${messages.length} persisted message(s) for session ${sessionId}.`
        );
        if (messages.length < 4) {
          logMemoryAgent(
            `Skip session ${sessionId}: only ${messages.length} message(s), below threshold.`
          );
          return false;
        }

        const lastProcessedCount = this.processedMessageCounts.get(sessionId);
        if (lastProcessedCount !== undefined && lastProcessedCount >= messages.length) {
          logMemoryAgent(
            `Session ${sessionId} unchanged (${messages.length} message(s)); skipping.`
          );
          return false;
        }

        const sessions = await listSessions(workspaceId);
        const sessionTitle =
          sessions.find((session) => session.id === sessionId)?.title ?? "Untitled Session";
        const memoryContent = await loadFile("MEMORY.md");
        const userContent = await loadFile("USER.md");
        logMemoryAgent(
          `Loaded memory state for session ${sessionId}: MEMORY.md chars=${memoryContent?.length ?? 0}, USER.md chars=${userContent?.length ?? 0}.`
        );
        const {
          prompt,
          totalTranscriptMessages,
          keptTranscriptMessages,
          omittedTranscriptMessages,
        } = buildMemoryPrompt(messages, sessionTitle, memoryContent, userContent);
        if (keptTranscriptMessages === 0) {
          logMemoryAgent(
            `Skip session ${sessionId}: no text transcript eligible for memory extraction.`
          );
          return false;
        }

        logMemoryAgent(
          `Built memory prompt for session ${sessionId}: transcript=${keptTranscriptMessages}/${totalTranscriptMessages}, omitted=${omittedTranscriptMessages}, chars=${prompt.length}, title="${sessionTitle}".`
        );
        const targetZoraDir = getZoraMemoryDirPath();
        const memorySessionId = `__memory_${sessionId}__`;

        logMemoryAgent(
          `Starting memory run ${memorySessionId} for session ${sessionId} in ${targetZoraDir}.`
        );

        const profile = await buildMemoryProfile({
          sdkRuntime: getSDKRuntimeOptions(),
          prompt,
        });
        logMemoryAgent(
          `Built memory profile for session ${sessionId}: cwd=${profile.options.cwd}, maxTurns=${profile.options.maxTurns}, promptChars=${profile.prompt.length}.`
        );

        await runAgentWithProfile(
          memorySessionId,
          profile,
          () => {},
          undefined,
          workspaceId,
          "memory"
        );
        this.processedMessageCounts.set(sessionId, messages.length);

        logMemoryAgent(
          `Completed memory run for session ${sessionId} in ${Date.now() - startedAt}ms.`
        );
        return true;
      } catch (error) {
        console.error(
          `${MEMORY_AGENT_PREFIX} Failed to process session ${sessionId}:`,
          error
        );
        return false;
      } finally {
        this.processing.delete(sessionId);
        this.deletePendingContext(sessionId);
      }
    })();
  }
}

export const memoryAgent = new MemoryAgent();
