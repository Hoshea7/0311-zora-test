import { useAtom, useSetAtom } from "jotai";
import {
  startConversationAtom,
  failConversationAtom,
  draftAtom,
  isRunningAtom,
} from "../../store/chat";
import {
  currentSessionIdAtom,
  createSessionAtom
} from "../../store/workspace";
import { getErrorMessage } from "../../utils/message";
import { ChatHeader } from "../chat/ChatHeader";
import { MessageList } from "../chat/MessageList";
import { ChatInput } from "../chat/ChatInput";
import { PermissionBanner } from "../chat/PermissionBanner";
import { AskUserBanner } from "../chat/AskUserBanner";

export function MainArea() {
  const startConversation = useSetAtom(startConversationAtom);
  const failConversation = useSetAtom(failConversationAtom);
  const setDraft = useSetAtom(draftAtom);
  const setIsRunning = useSetAtom(isRunningAtom);
  const [currentSessionId] = useAtom(currentSessionIdAtom);
  const createSession = useSetAtom(createSessionAtom);

  const handleSubmit = async () => {
    const draft = document.querySelector<HTMLTextAreaElement>("textarea")?.value.trim();
    if (!draft) return;

    let sessionId = currentSessionId;
    if (!sessionId) {
      const title = draft.length > 20 ? `${draft.slice(0, 20)}...` : draft;
      sessionId = await createSession(title);
    }

    startConversation(draft);
    setDraft("");

    try {
      await window.zora.chat({ sessionId, text: draft });
    } catch (error) {
      failConversation(getErrorMessage(error));
    }
  };

  const handleStop = async () => {
    setIsRunning(false);

    try {
      await window.zora.stopAgent();
    } catch (error) {
      failConversation(getErrorMessage(error));
    }
  };

  return (
    <section className="flex h-full flex-col overflow-hidden bg-white">
      <ChatHeader />

      <div className="titlebar-no-drag flex-1 overflow-y-auto px-5 py-5 sm:px-8">
        <MessageList />
      </div>

      <footer className="titlebar-no-drag bg-white px-6 py-4">
        <div className="mx-auto w-full max-w-4xl">
          <PermissionBanner />
          <AskUserBanner />
          <ChatInput onSubmit={handleSubmit} onStop={handleStop} />
        </div>
      </footer>
    </section>
  );
}
