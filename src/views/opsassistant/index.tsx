import { useEffect, useMemo, useRef, useState } from "react";
import AssistantMessage from "./components/AssistantMessage";
import { useAssistantChat } from "./hooks/useAssistantChat";
import type { AssistantMessage as Message } from "./types";

export default function OpsAssistant() {
  const { messages, isLoading, lastAssistant, suggestionPool, send, clear } = useAssistantChat();
  const [input, setInput] = useState("");
  const [copiedMessageID, setCopiedMessageID] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const quickActions = useMemo(
    () => [
      {
        label: "Explain Simpler",
        prompt: buildFollowUpPrompt("Explain this in simpler terms", lastAssistant?.content),
      },
      {
        label: "Step-by-Step Runbook",
        prompt: buildFollowUpPrompt("Give me a step-by-step runbook", lastAssistant?.content),
      },
      {
        label: "kubectl Commands",
        prompt: buildFollowUpPrompt("Give only kubectl commands to verify and fix", lastAssistant?.content),
      },
    ],
    [lastAssistant?.content],
  );

  const submit = async (promptOverride?: string) => {
    const content = (promptOverride ?? input).trim();
    if (content === "" || isLoading) {
      return;
    }
    setInput("");
    await send(content);
  };

  const copyMessage = async (message: Message) => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedMessageID(message.id);
      window.setTimeout(() => setCopiedMessageID(null), 1200);
    } catch {
      // no-op
    }
  };

  return (
    <div className="h-[calc(100vh-140px)] app-shell overflow-hidden grid grid-cols-1 xl:grid-cols-[1fr_320px]">
      <section className="flex flex-col overflow-hidden border-r border-zinc-700">
        <header className="border-b border-zinc-700 px-5 py-4 bg-zinc-900/95">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-zinc-100">Ops Assistant</h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                Interactive debug assistant with diagnostics + documentation grounding
              </p>
            </div>
            <div className="flex items-center gap-2">
              <StatusPill label="Mode" value="Interactive" />
              <StatusPill label="Messages" value={String(messages.length)} />
              <button onClick={clear} className="btn-sm">
                Clear
              </button>
            </div>
          </div>
        </header>

        <section className="border-b border-zinc-700 px-5 py-3 bg-zinc-900/80">
          <p className="text-[11px] uppercase tracking-wide text-zinc-500 font-semibold">Quick prompts</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {suggestionPool.map((suggestion) => (
              <button key={suggestion} onClick={() => void submit(suggestion)} className="btn-sm bg-zinc-800/60">
                {suggestion}
              </button>
            ))}
          </div>
        </section>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4 bg-zinc-900/55">
          {messages.map((message) => (
            <AssistantMessage
              key={message.id}
              message={message}
              copied={copiedMessageID === message.id}
              onCopy={copyMessage}
              onRunPrompt={(prompt) => void submit(prompt)}
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

        <footer className="border-t border-zinc-700 px-5 py-4 bg-zinc-900">
          <div className="flex gap-2">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void submit();
                }
              }}
              placeholder="Ask for diagnostics, root cause analysis, manifest templates, or action priorities"
              className="field min-h-11 h-11 max-h-32 flex-1 resize-y py-2"
            />
            <button onClick={() => void submit()} disabled={!input.trim() || isLoading} className="btn-solid h-11 px-5">
              Send
            </button>
          </div>
          <p className="mt-2 text-[11px] text-zinc-500">Press Enter to send, Shift+Enter for newline.</p>
        </footer>
      </section>

      <aside className="hidden xl:flex xl:flex-col bg-zinc-900/80">
        <div className="border-b border-zinc-700 px-4 py-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500 font-semibold">Interactive follow-ups</p>
          <div className="mt-3 space-y-2">
            {quickActions.map((action) => (
              <button
                key={action.label}
                onClick={() => void submit(action.prompt)}
                disabled={isLoading || action.prompt.trim() === ""}
                className="w-full rounded-md border border-zinc-700 bg-zinc-800/60 px-2 py-1.5 text-left text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-4 py-4 border-b border-zinc-700">
          <p className="text-xs uppercase tracking-wide text-zinc-500 font-semibold">Session</p>
          <div className="mt-3 space-y-2 text-xs text-zinc-300">
            <InfoRow label="Assistant replies" value={String(messages.filter((m) => m.role === "assistant").length)} />
            <InfoRow label="Pending" value={isLoading ? "Yes" : "No"} />
            <InfoRow label="References" value={String(lastAssistant?.references?.length ?? 0)} />
          </div>
        </div>

        <div className="px-4 py-4 overflow-auto">
          <p className="text-xs uppercase tracking-wide text-zinc-500 font-semibold">Latest referenced resources</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(lastAssistant?.resources ?? []).map((resource) => (
              <button
                key={`ctx-${resource}`}
                onClick={() => void submit(toDiagnosePrompt(resource))}
                className="rounded-md border border-zinc-700 bg-zinc-800/60 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800"
              >
                {resource}
              </button>
            ))}
            {(lastAssistant?.resources?.length ?? 0) === 0 && (
              <p className="text-xs text-zinc-500">No referenced resources yet.</p>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

function buildFollowUpPrompt(prefix: string, answer?: string): string {
  const trimmed = (answer ?? "").trim();
  if (trimmed === "") {
    return "Show cluster health";
  }

  const compact = trimmed.length > 1200 ? `${trimmed.slice(0, 1200)}...` : trimmed;
  return `${prefix}:\n\n${compact}`;
}

function toDiagnosePrompt(resource: string): string {
  const trimmed = resource.trim();
  if (trimmed === "") {
    return "Show cluster health";
  }
  const podName = trimmed.includes("/") ? (trimmed.split("/").pop() ?? trimmed) : trimmed;
  return `Diagnose ${podName}`;
}

function StatusPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-700 bg-zinc-800/60 px-2 py-1 text-zinc-300 text-[11px]">
      <span className="text-zinc-500">{label}:</span> {value}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <p className="rounded-md border border-zinc-700 bg-zinc-800/60 px-2 py-1">
      <span className="text-zinc-500">{label}:</span> {value}
    </p>
  );
}
