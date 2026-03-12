interface TabButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

export function TabButton({ label, active, onClick }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md border px-3 py-1.5 text-xs ${
        active ? "border-[#00d4a8]/50 bg-[#00d4a8]/15 text-zinc-100" : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
      }`}
    >
      {label}
    </button>
  );
}
