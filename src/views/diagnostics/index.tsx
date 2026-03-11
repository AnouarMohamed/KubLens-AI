import { DiagnosticsHeader } from "./components/DiagnosticsHeader";
import { DiagnosticsIssueTable } from "./components/DiagnosticsIssueTable";
import { DiagnosticsNarrative } from "./components/DiagnosticsNarrative";
import { DiagnosticsOverview } from "./components/DiagnosticsOverview";
import { DiagnosticsBanner } from "./components/DiagnosticsPrimitives";
import { useDiagnosticsData } from "./hooks/useDiagnosticsData";

export default function Diagnostics() {
  const {
    canWrite,
    diagnostics,
    isLoading,
    isAlerting,
    alertMessage,
    error,
    prioritizedIssues,
    summaryHighlights,
    refresh,
    sendTestAlert,
    dispatchTopIssue,
  } = useDiagnosticsData();

  return (
    <div className="space-y-5">
      <DiagnosticsHeader
        isLoading={isLoading}
        isAlerting={isAlerting}
        canWrite={canWrite}
        hasPrioritizedIssues={prioritizedIssues.length > 0}
        onRefresh={() => void refresh()}
        onSendTestAlert={() => void sendTestAlert()}
        onDispatchTopIssue={() => void dispatchTopIssue()}
      />

      {error && <DiagnosticsBanner text={error} />}
      {alertMessage && <DiagnosticsBanner text={alertMessage} />}

      {diagnostics && (
        <>
          <DiagnosticsOverview
            diagnostics={diagnostics}
            summaryHighlights={summaryHighlights}
            prioritizedIssues={prioritizedIssues}
          />
          <DiagnosticsNarrative summary={diagnostics.summary} />
          <DiagnosticsIssueTable issues={diagnostics.issues} />
        </>
      )}
    </div>
  );
}
