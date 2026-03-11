interface DiagnosticsNarrativeProps {
  summary: string;
}

export function DiagnosticsNarrative({ summary }: DiagnosticsNarrativeProps) {
  return (
    <details className="rounded-lg border border-zinc-700 bg-zinc-900/70 px-3 py-2">
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Raw narrative
      </summary>
      <pre className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">{summary}</pre>
    </details>
  );
}
