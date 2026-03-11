import type { AssistantIntent } from "../constants";
import { StatusPill } from "./OpsAssistantPrimitives";

interface OpsAssistantHeaderProps {
  intentMode: AssistantIntent;
  messageCount: number;
  selectedNamespace: string;
  namespaces: string[];
  onNamespaceChange: (value: string) => void;
  onClear: () => void;
}

export function OpsAssistantHeader({
  intentMode,
  messageCount,
  selectedNamespace,
  namespaces,
  onNamespaceChange,
  onClear,
}: OpsAssistantHeaderProps) {
  return (
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
          <StatusPill label="Messages" value={String(messageCount)} />
          <select
            value={selectedNamespace}
            onChange={(event) => onNamespaceChange(event.target.value)}
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
          <button onClick={onClear} className="btn-sm">
            Clear
          </button>
        </div>
      </div>
    </header>
  );
}
