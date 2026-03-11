interface RemediationHeaderProps {
  canRead: boolean;
  isLoading: boolean;
  isActing: boolean;
  onRefresh: () => void;
  onGenerate: () => void;
}

export function RemediationHeader({ canRead, isLoading, isActing, onRefresh, onGenerate }: RemediationHeaderProps) {
  return (
    <header className="panel-head">
      <div>
        <h2 className="text-2xl font-semibold text-zinc-100 tracking-tight">Safe Auto-Remediation</h2>
        <p className="text-sm text-zinc-400 mt-1">
          Review ranked proposals, approve with RBAC, and execute with explicit safety confirmation.
        </p>
      </div>
      <div className="flex gap-2">
        <button onClick={onRefresh} disabled={isLoading || isActing} className="btn">
          {isLoading ? "Loading" : "Refresh"}
        </button>
        <button onClick={onGenerate} disabled={!canRead || isActing} className="btn-primary">
          Generate Proposals
        </button>
      </div>
    </header>
  );
}
