interface DiagnosticsHeaderProps {
  isLoading: boolean;
  isAlerting: boolean;
  canWrite: boolean;
  hasPrioritizedIssues: boolean;
  onRefresh: () => void;
  onSendTestAlert: () => void;
  onDispatchTopIssue: () => void;
}

export function DiagnosticsHeader({
  isLoading,
  isAlerting,
  canWrite,
  hasPrioritizedIssues,
  onRefresh,
  onSendTestAlert,
  onDispatchTopIssue,
}: DiagnosticsHeaderProps) {
  return (
    <header className="panel-head">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-zinc-100">Diagnostics</h2>
        <p className="mt-1 text-sm text-zinc-400">Automated checks with prioritized, actionable issue reporting.</p>
      </div>
      <button onClick={onRefresh} disabled={isLoading} className="btn">
        {isLoading ? "Loading" : "Refresh"}
      </button>
      <div className="flex gap-2">
        <button onClick={onSendTestAlert} disabled={!canWrite || isAlerting} className="btn">
          {isAlerting ? "Sending" : "Test Alert"}
        </button>
        <button
          onClick={onDispatchTopIssue}
          disabled={!canWrite || isAlerting || !hasPrioritizedIssues}
          className="btn"
        >
          Alert Top Issue
        </button>
      </div>
    </header>
  );
}
