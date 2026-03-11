import { useEffect, useMemo, useRef, useState } from "react";
import AssistantMessage from "./components/AssistantMessage";
import { useAssistantChat } from "./hooks/useAssistantChat";
import type { AssistantMessage as Message } from "./types";
import { api } from "../../lib/api";

type AssistantIntent = "triage" | "remediate" | "verify";

const ASSISTANT_DRAFT_KEY = "k8s-ops.assistant.draft.v1";

export default function OpsAssistant() {
  const { messages, isLoading, lastAssistant, suggestionPool, diagnosticPrompts, send, clear } = useAssistantChat();
  const [input, setInput] = useState("");
  const [intentMode, setIntentMode] = useState<AssistantIntent>("triage");
  const [copiedMessageID, setCopiedMessageID] = useState<string | null>(null);
  const [referenceFeedback, setReferenceFeedback] = useState<Record<string, "helpful" | "not_helpful" | "pending">>({});
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [selectedNamespace, setSelectedNamespace] = useState("All");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  useEffect(() => {
    const saved = window.localStorage.getItem(ASSISTANT_DRAFT_KEY);
    if (!saved) {
      return;
    }
    setInput(saved);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(ASSISTANT_DRAFT_KEY, input);
  }, [input]);

  useEffect(() => {
    let cancelled = false;
    const loadNamespaces = async () => {
      try {
        const rows = await api.getNamespaces();
        if (cancelled) {
          return;
        }
        setNamespaces(rows);
      } catch {
        // Namespace context is optional for assistant prompts.
      }
    };
    void loadNamespaces();
    return () => {
      cancelled = true;
    };
  }, []);

  const quickActions = useMemo(
    () => [
      {
        label: "Explain Simpler",
        prompt: buildFollowUpPrompt("Explain this in simpler terms", lastAssistant?.content),
      },
      {
        label: "Step-by-step runbook",
        prompt: buildFollowUpPrompt("Give me a step-by-step runbook", lastAssistant?.content),
      },
      {
        label: "kubectl only",
        prompt: buildFollowUpPrompt("Give only kubectl commands to verify and fix", lastAssistant?.content),
      },
      {
        label: "Rollback and blast radius",
        prompt: buildFollowUpPrompt("Include rollback steps and blast radius assessment", lastAssistant?.content),
      },
    ],
    [lastAssistant?.content],
  );

  const decisionPrompts = useMemo(() => {
    const prompts: string[] = [];
    if ((lastAssistant?.resources?.length ?? 0) > 0) {
      prompts.push(`Create an operator checklist for ${lastAssistant?.resources?.[0]}`);
    }
    if ((lastAssistant?.references?.length ?? 0) > 0) {
      prompts.push("Summarize evidence quality from referenced docs before acting");
    }
    prompts.push("Which action gives the highest risk reduction in the next 10 minutes?");
    prompts.push("What should I monitor right after applying the fix?");
    return prompts.slice(0, 4);
  }, [lastAssistant?.references?.length, lastAssistant?.resources]);

  const submit = async (promptOverride?: string) => {
    const content = (promptOverride ?? input).trim();
    if (content === "" || isLoading) {
      return;
    }
    setInput("");
    const preparedPrompt = applyIntentToPrompt(content, intentMode);
    await send(preparedPrompt, selectedNamespace === "All" ? undefined : selectedNamespace);
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

  const submitReferenceFeedback = async (message: Message, url: string, helpful: boolean) => {
    if (message.role !== "assistant") {
      return;
    }
    const key = `${message.id}::${url}`;
    setReferenceFeedback((current) => ({ ...current, [key]: "pending" }));
    try {
      await api.submitAssistantReferenceFeedback({
        query: message.query ?? "",
        url,
        helpful,
      });
      setReferenceFeedback((current) => ({
        ...current,
        [key]: helpful ? "helpful" : "not_helpful",
      }));
    } catch {
      setReferenceFeedback((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    }
  };

  const assistantReplies = messages.filter((m) => m.role === "assistant").length;

  return (
    <div className="h-[calc(100vh-140px)] app-shell overflow-hidden grid grid-cols-1 xl:grid-cols-[1fr_340px]">
      <section className="flex flex-col overflow-hidden border-r border-zinc-700">
        <header className="border-b border-zinc-700 px-5 py-4 bg-zinc-900/95">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-zinc-100">Ops Assistant</h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                Intent-guided assistant for triage, safe remediation, and post-fix verification.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <StatusPill label="Mode" value={intentMode} />
              <StatusPill label="Messages" value={String(messages.length)} />
              <select
                value={selectedNamespace}
                onChange={(event) => setSelectedNamespace(event.target.value)}
                className="field h-8 w-40 text-[11px]"
                aria-label="Assistant namespace scope"
              >
                <option value="All">All namespaces</option>
                {namespaces.map((namespace) => (
                  <option key={namespace} value={namespace}>
                    {namespace}
                  </option>
                ))}
              </select>
              <button
                onClick={() => {
                  clear();
                  setInput("");
                  setReferenceFeedback({});
                }}
                className="btn-sm"
              >
                Clear
              </button>
            </div>
          </div>
        </header>

        <section className="border-b border-zinc-700 px-5 py-3 bg-zinc-900/80">
          <p className="text-[11px] uppercase tracking-wide text-zinc-500 font-semibold">Operator intent</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {intentOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setIntentMode(option.value)}
                className={`btn-sm ${intentMode === option.value ? "border-[var(--accent)] bg-[var(--accent-dim)] text-zinc-100" : ""}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </section>

        <section className="border-b border-zinc-700 px-5 py-3 bg-zinc-900/80">
          <p className="text-[11px] uppercase tracking-wide text-zinc-500 font-semibold">Quick prompts</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {suggestionPool.map((suggestion) => (
              <button key={suggestion} onClick={() => void submit(suggestion)} className="btn-sm bg-zinc-800/60">
                {suggestion}
              </button>
            ))}
          </div>
          <p className="mt-3 text-[11px] uppercase tracking-wide text-zinc-500 font-semibold">High-signal prompts</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {diagnosticPrompts.map((prompt) => (
              <button key={prompt} onClick={() => void submit(prompt)} className="btn-sm bg-zinc-800/60">
                {prompt}
              </button>
            ))}
            {diagnosticPrompts.length === 0 && (
              <span className="text-xs text-zinc-500">No diagnostic prompt pack yet.</span>
            )}
          </div>
        </section>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4 bg-zinc-900/55">
          {messages.map((message) => (
            <AssistantMessage
              key={message.id}
              message={message}
              copied={copiedMessageID === message.id}
              referenceFeedback={referenceFeedback}
              onCopy={copyMessage}
              onRunPrompt={(prompt) => void submit(prompt)}
              onReferenceFeedback={(row, url, helpful) => void submitReferenceFeedback(row, url, helpful)}
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
                if ((event.key === "Enter" && !event.shiftKey) || (event.key === "Enter" && event.ctrlKey)) {
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
          <p className="mt-2 text-[11px] text-zinc-500">
            Enter to send. Shift+Enter for newline. Current mode: {intentMode}.
          </p>
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
          <p className="text-xs uppercase tracking-wide text-zinc-500 font-semibold">Decision support</p>
          <div className="mt-3 space-y-2">
            {decisionPrompts.map((prompt) => (
              <button
                key={prompt}
                onClick={() => void submit(prompt)}
                disabled={isLoading}
                className="w-full rounded-md border border-zinc-700 bg-zinc-800/60 px-2 py-1.5 text-left text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>

        <div className="px-4 py-4 border-b border-zinc-700">
          <p className="text-xs uppercase tracking-wide text-zinc-500 font-semibold">Session</p>
          <div className="mt-3 space-y-2 text-xs text-zinc-300">
            <InfoRow label="Assistant replies" value={String(assistantReplies)} />
            <InfoRow label="Pending" value={isLoading ? "Yes" : "No"} />
            <InfoRow label="References" value={String(lastAssistant?.references?.length ?? 0)} />
            <InfoRow label="Namespace" value={selectedNamespace} />
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

function applyIntentToPrompt(prompt: string, intent: AssistantIntent): string {
  const trimmed = prompt.trim();
  if (trimmed === "") {
    return trimmed;
  }

  if (intent === "triage") {
    return `Triage mode: prioritize probable root causes, confidence level, and immediate next checks.\n\n${trimmed}`;
  }
  if (intent === "remediate") {
    return `Remediation mode: provide safest fix path first, include rollback plan and risk notes.\n\n${trimmed}`;
  }
  return `Verification mode: provide post-change validation checks, expected signals, and watchouts.\n\n${trimmed}`;
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

const intentOptions: Array<{ value: AssistantIntent; label: string }> = [
  { value: "triage", label: "Triage" },
  { value: "remediate", label: "Remediate" },
  { value: "verify", label: "Verify" },
];

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
