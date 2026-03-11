import type { AssistantIntent } from "../constants";

interface OpsAssistantIntentBarProps {
  intentMode: AssistantIntent;
  intentOptions: Array<{ value: AssistantIntent; label: string }>;
  onIntentChange: (intent: AssistantIntent) => void;
}

export function OpsAssistantIntentBar({ intentMode, intentOptions, onIntentChange }: OpsAssistantIntentBarProps) {
  return (
    <section className="border-b border-zinc-700 px-5 py-3 bg-zinc-900/80">
      <p className="text-[11px] uppercase tracking-wide text-zinc-500 font-semibold">Operator intent</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {intentOptions.map((option) => (
          <button
            key={option.value}
            onClick={() => onIntentChange(option.value)}
            className={`btn-sm ${intentMode === option.value ? "border-[var(--accent)] bg-[var(--accent-dim)] text-zinc-100" : ""}`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </section>
  );
}
