import type { ReactNode } from "react";

interface DeploymentModalShellProps {
  maxWidthClass: string;
  header: ReactNode;
  children: ReactNode;
}

export function DeploymentModalShell({ maxWidthClass, header, children }: DeploymentModalShellProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className={`w-full app-shell ${maxWidthClass}`}>
        {header}
        {children}
      </div>
    </div>
  );
}

interface DeploymentModalHeaderProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
}

export function DeploymentModalHeader({ title, subtitle, onClose }: DeploymentModalHeaderProps) {
  return (
    <header className="flex items-center justify-between border-b border-zinc-700 px-4 py-3">
      <div>
        <p className="text-sm font-semibold text-zinc-100">{title}</p>
        {subtitle && <p className="mt-0.5 text-xs text-zinc-400">{subtitle}</p>}
      </div>
      <button onClick={onClose} className="btn-sm border-zinc-600">
        Close
      </button>
    </header>
  );
}

interface DeploymentInfoRowProps {
  label: string;
  value: string;
}

export function DeploymentInfoRow({ label, value }: DeploymentInfoRowProps) {
  return (
    <p className="rounded-md border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200">
      <span className="text-zinc-500">{label}:</span> {value}
    </p>
  );
}
