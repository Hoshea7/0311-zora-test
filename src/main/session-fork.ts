import type { ConversationMessage, SessionForkResult } from "../shared/zora";
import {
  createForkedSession,
  getSessionMeta,
  loadMessages,
} from "./session-store";
import { getWorkspacePath } from "./workspace-store";

export interface ForkSessionFromSourceInput {
  sourceSessionId: string;
  workspaceId: string;
  title?: string;
}

function normalizeOptionalTitle(title?: string): string | undefined {
  const trimmed = title?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

export async function forkSessionFromSource(
  input: ForkSessionFromSourceInput
): Promise<SessionForkResult> {
  const source = await getSessionMeta(input.sourceSessionId, input.workspaceId);

  if (!source) {
    throw new Error(`Session ${input.sourceSessionId} not found.`);
  }

  if (!source.sdkSessionId) {
    throw new Error(
      "当前会话还没有可分叉的 Claude SDK 上下文。请先在该会话里发送一条消息后再试。"
    );
  }

  const workspacePath = await getWorkspacePath(input.workspaceId);
  const title = normalizeOptionalTitle(input.title) ?? `${source.title} 的分支`;
  const { forkSession: forkSdkSession } = await import(
    "@anthropic-ai/claude-agent-sdk"
  );
  const sdkFork = await forkSdkSession(source.sdkSessionId, {
    dir: workspacePath,
    title,
  });

  if (!sdkFork.sessionId) {
    throw new Error("Claude Agent SDK did not return a forked session id.");
  }

  const session = await createForkedSession(
    {
      sourceSessionId: source.id,
      sourceSdkSessionId: source.sdkSessionId,
      sdkSessionId: sdkFork.sessionId,
      title,
    },
    input.workspaceId
  );
  const messages: ConversationMessage[] = await loadMessages(
    session.id,
    input.workspaceId
  );

  return {
    session,
    messages,
  };
}
