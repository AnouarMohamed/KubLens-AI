import { toDiagnosePrompt } from "../utils";
import { InfoRow } from "./OpsAssistantPrimitives";

interface OpsAssistantSidebarProps {
  quickActions: Array<{ label: string; prompt: string }>;
  decisionPrompts: string[];
  assistantReplies: number;
  isLoading: boolean;
  referencesCount: number;
  selectedNamespace: string;
  latestResources: string[];
  onRunPrompt: (prompt: string) => void;
}

export function OpsAssistantSidebar({
  quickActions,
  decisionPrompts,
  assistantReplies,
  isLoading,
  referencesCount,
  selectedNamespace,
  latestResources,
  onRunPrompt,
}: OpsAssistantSidebarProps) {
  return (
    <aside className="hidden xl:flex xl:flex-col bg-zinc-900/80">
      <div className="border-b border-zinc-700 px-4 py-4">
        <p className="text-xs uppercase tracking-wide text-zinc-500 font-semibold">Interactive follow-ups</p>
        <div className="mt-3 space-y-2">
          {quickActions.map((action) => (
            <button
              key={action.label}
              onClick={() => onRunPrompt(action.prompt)}
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
              onClick={() => onRunPrompt(prompt)}
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
          <InfoRow label="References" value={String(referencesCount)} />
          <InfoRow label="Namespace" value={selectedNamespace} />
        </div>
      </div>

      <div className="px-4 py-4 overflow-auto">
        <p className="text-xs uppercase tracking-wide text-zinc-500 font-semibold">Latest referenced resources</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {latestResources.map((resource) => (
            <button
              key={`ctx-${resource}`}
              onClick={() => onRunPrompt(toDiagnosePrompt(resource))}
              className="rounded-md border border-zinc-700 bg-zinc-800/60 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800"
            >
              {resource}
            </button>
          ))}
          {latestResources.length === 0 && <p className="text-xs text-zinc-500">No referenced resources yet.</p>}
        </div>
      </div>
    </aside>
  );
}
