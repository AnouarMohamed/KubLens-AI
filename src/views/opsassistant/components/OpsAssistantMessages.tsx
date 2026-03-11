import AssistantMessage from "./AssistantMessage";
import type { AssistantMessage as Message } from "../types";
import type { MutableRefObject } from "react";

interface OpsAssistantMessagesProps {
  messages: Message[];
  isLoading: boolean;
  copiedMessageID: string | null;
  referenceFeedback: Record<string, "helpful" | "not_helpful" | "pending">;
  scrollRef: MutableRefObject<HTMLDivElement | null>;
  onCopy: (message: Message) => Promise<void>;
  onRunPrompt: (prompt: string) => void;
  onReferenceFeedback: (message: Message, url: string, helpful: boolean) => Promise<void>;
}

export function OpsAssistantMessages({
  messages,
  isLoading,
  copiedMessageID,
  referenceFeedback,
  scrollRef,
  onCopy,
  onRunPrompt,
  onReferenceFeedback,
}: OpsAssistantMessagesProps) {
  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4 bg-zinc-900/55">
      {messages.map((message) => (
        <AssistantMessage
          key={message.id}
          message={message}
          copied={copiedMessageID === message.id}
          referenceFeedback={referenceFeedback}
          onCopy={(row) => void onCopy(row)}
          onRunPrompt={(prompt) => onRunPrompt(prompt)}
          onReferenceFeedback={(row, url, helpful) => void onReferenceFeedback(row, url, helpful)}
        />
      ))}

      {isLoading && (
        <div className="flex justify-start">
          <div className="rounded-lg border border-zinc-700 bg-zinc-800/55 px-3.5 py-3 text-sm text-zinc-400">
            Thinking and checking context...
          </div>
        </div>
      )}
    </div>
  );
}
