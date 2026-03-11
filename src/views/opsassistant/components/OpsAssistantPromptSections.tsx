interface OpsAssistantPromptSectionsProps {
  suggestionPool: string[];
  diagnosticPrompts: string[];
  onRunPrompt: (prompt: string) => void;
}

export function OpsAssistantPromptSections({
  suggestionPool,
  diagnosticPrompts,
  onRunPrompt,
}: OpsAssistantPromptSectionsProps) {
  return (
    <section className="border-b border-zinc-700 px-5 py-3 bg-zinc-900/80">
      <p className="text-[11px] uppercase tracking-wide text-zinc-500 font-semibold">Quick prompts</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {suggestionPool.map((suggestion) => (
          <button key={suggestion} onClick={() => onRunPrompt(suggestion)} className="btn-sm bg-zinc-800/60">
            {suggestion}
          </button>
        ))}
      </div>
      <p className="mt-3 text-[11px] uppercase tracking-wide text-zinc-500 font-semibold">High-signal prompts</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {diagnosticPrompts.map((prompt) => (
          <button key={prompt} onClick={() => onRunPrompt(prompt)} className="btn-sm bg-zinc-800/60">
            {prompt}
          </button>
        ))}
        {diagnosticPrompts.length === 0 && (
          <span className="text-xs text-zinc-500">No diagnostic prompt pack yet.</span>
        )}
      </div>
    </section>
  );
}
