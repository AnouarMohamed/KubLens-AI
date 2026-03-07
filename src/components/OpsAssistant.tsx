import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const suggestions = [
  "Diagnose payment-gateway",
  "Show cluster health",
  "Generate deployment manifest",
  "What should I fix first?",
];

export default function OpsAssistant() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Assistant is ready. Ask for cluster diagnostics, root causes, and concrete next actions.",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const send = async () => {
    const content = input.trim();
    if (content === "" || isLoading) {
      return;
    }

    setMessages((state) => [...state, { role: "user", content }]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await api.askAssistant(content);
      setMessages((state) => [...state, { role: "assistant", content: response.answer }]);
    } catch (err) {
      setMessages((state) => [
        ...state,
        { role: "assistant", content: `Request failed: ${err instanceof Error ? err.message : "Unknown error"}` },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-[calc(100vh-140px)] app-shell flex flex-col overflow-hidden">
      <header className="border-b border-zinc-700 px-5 py-4 bg-zinc-900/95">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-zinc-100">Ops Assistant</h3>
            <p className="text-xs text-zinc-500 mt-0.5">Action-focused guidance backed by diagnostics data</p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <StatusPill label="Mode" value="Analytical" />
            <StatusPill label="Source" value="Cluster API" />
          </div>
        </div>
      </header>

      <section className="border-b border-zinc-700 px-5 py-3 bg-zinc-900/80">
        <p className="text-[11px] uppercase tracking-wide text-zinc-500 font-semibold">Quick prompts</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => setInput(suggestion)}
              className="btn-sm bg-zinc-800/60"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </section>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4 bg-zinc-900/55">
        {messages.map((message, index) => (
          <article key={index} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className="max-w-[85%]">
              <p className="mb-1 text-[11px] uppercase tracking-wide text-zinc-500">{message.role === "user" ? "Operator" : "Assistant"}</p>
              <div
                className={`rounded-md border px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed ${
                  message.role === "user"
                    ? "border-[#2496ed]/55 bg-[#2496ed]/14 text-zinc-100"
                    : "border-zinc-700 bg-zinc-800/55 text-zinc-200"
                }`}
              >
                {message.content}
              </div>
            </div>
          </article>
        ))}
        {isLoading && <p className="text-sm text-zinc-500">Assistant is processing your request...</p>}
      </div>

      <footer className="border-t border-zinc-700 px-5 py-4 bg-zinc-900">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && void send()}
            placeholder="Ask for diagnostics, health summaries, or manifests"
            className="field h-11 flex-1"
          />
          <button
            onClick={() => void send()}
            disabled={!input.trim() || isLoading}
            className="btn-solid h-11"
          >
            Send
          </button>
        </div>
      </footer>
    </div>
  );
}

function StatusPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-700 bg-zinc-800/60 px-2 py-1 text-zinc-300">
      <span className="text-zinc-500">{label}:</span> {value}
    </div>
  );
}
