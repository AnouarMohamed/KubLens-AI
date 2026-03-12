interface MaintenanceStepProps {
  title: string;
  description: string;
  state: "pending" | "done" | "warning";
  actionLabel: string;
  disabled: boolean;
  onAction: () => void;
}

export function MaintenanceStep({ title, description, state, actionLabel, disabled, onAction }: MaintenanceStepProps) {
  const stateClass =
    state === "done"
      ? "border-[#34c759]/45 bg-[#34c759]/12"
      : state === "warning"
        ? "border-[#eab308]/45 bg-[#eab308]/12"
        : "border-zinc-800 bg-zinc-900/60";

  return (
    <div className={`rounded-md border p-3 ${stateClass}`}>
      <p className="text-sm font-semibold text-zinc-100">{title}</p>
      <p className="mt-1 text-xs text-zinc-400">{description}</p>
      <button onClick={onAction} className="btn-sm mt-3" disabled={disabled}>
        {actionLabel}
      </button>
    </div>
  );
}
