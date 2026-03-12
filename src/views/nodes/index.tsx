import NodeDetailModal from "../../components/nodes/NodeDetailModal";
import { NodesSummary } from "./components/NodesSummary";
import { NodesTable } from "./components/NodesTable";
import { NodesToolbar } from "./components/NodesToolbar";
import { useNodesData } from "./hooks/useNodesData";

export default function Nodes() {
  const {
    canRead,
    canWrite,
    nodes,
    filteredNodes,
    selectedNode,
    selectedNodePods,
    selectedNodeEvents,
    nodeRuleAlerts,
    isDispatchingNodeAlert,
    isUpdatingNodeAlertLifecycle,
    selectedNodeNames,
    search,
    isLoading,
    isBusy,
    lastDrainPreview,
    error,
    setSearch,
    load,
    openDetail,
    cordon,
    uncordon,
    previewDrain,
    drain,
    toggleNodeSelection,
    toggleSelectAllVisible,
    clearNodeSelection,
    bulkCordon,
    bulkUncordon,
    bulkDrain,
    dispatchNodeRuleAlert,
    updateNodeAlertLifecycle,
    clearSelectedNode,
  } = useNodesData();

  return (
    <div className="space-y-5">
      <header className="panel-head">
        <div>
          <h2 className="text-2xl font-semibold text-zinc-100 tracking-tight">Nodes</h2>
          <p className="text-sm text-zinc-400 mt-1">Infrastructure status and scheduling controls.</p>
        </div>
        <NodesToolbar
          search={search}
          onSearchChange={setSearch}
          onRefresh={() => void load()}
          isRefreshDisabled={isLoading || isBusy || !canRead}
          isLoading={isLoading}
        />
      </header>

      {error && (
        <div className="rounded-md border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-200">{error}</div>
      )}

      <NodesSummary nodes={nodes} filteredCount={filteredNodes.length} />

      {nodeRuleAlerts.length > 0 && (
        <section className="rounded-md border border-zinc-800 bg-zinc-900/60 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Node alert rules</p>
          <div className="mt-2 space-y-2">
            {nodeRuleAlerts.map((alert) => (
              <div key={alert.id} className="rounded-md border border-zinc-800 bg-zinc-900/70 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-zinc-100">{alert.title}</p>
                  <span
                    className={`rounded-md border px-2 py-0.5 text-[10px] uppercase tracking-wide ${lifecycleBadgeClass(alert.lifecycleStatus)}`}
                  >
                    {alert.lifecycleStatus}
                  </span>
                  {alert.snoozedUntil && (
                    <span className="text-[10px] text-zinc-500">until {new Date(alert.snoozedUntil).toLocaleString()}</span>
                  )}
                </div>
                <p className="text-xs text-zinc-400 mt-1">{alert.message}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    onClick={() => void dispatchNodeRuleAlert(alert.id)}
                    className="btn-sm"
                    disabled={!canWrite || isDispatchingNodeAlert}
                  >
                    {isDispatchingNodeAlert ? "Dispatching" : "Dispatch Alert"}
                  </button>
                  {alert.lifecycleStatus !== "acknowledged" && (
                    <button
                      onClick={() => void updateNodeAlertLifecycle(alert.id, "acknowledged")}
                      className="btn-sm"
                      disabled={!canWrite || isUpdatingNodeAlertLifecycle}
                    >
                      Acknowledge
                    </button>
                  )}
                  <button
                    onClick={() => void updateNodeAlertLifecycle(alert.id, "snoozed")}
                    className="btn-sm"
                    disabled={!canWrite || isUpdatingNodeAlertLifecycle}
                  >
                    Snooze
                  </button>
                  {alert.lifecycleStatus === "dismissed" ? (
                    <button
                      onClick={() => void updateNodeAlertLifecycle(alert.id, "active")}
                      className="btn-sm"
                      disabled={!canWrite || isUpdatingNodeAlertLifecycle}
                    >
                      Reopen
                    </button>
                  ) : (
                    <button
                      onClick={() => void updateNodeAlertLifecycle(alert.id, "dismissed")}
                      className="btn-sm"
                      disabled={!canWrite || isUpdatingNodeAlertLifecycle}
                    >
                      Dismiss
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-md border border-zinc-800 bg-zinc-900/60 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Bulk actions ({selectedNodeNames.length} selected)
          </p>
          <button onClick={() => void bulkCordon()} className="btn-sm" disabled={!canWrite || isBusy || selectedNodeNames.length === 0}>
            Cordon Selected
          </button>
          <button
            onClick={() => void bulkUncordon()}
            className="btn-sm"
            disabled={!canWrite || isBusy || selectedNodeNames.length === 0}
          >
            Uncordon Selected
          </button>
          <button
            onClick={() => void bulkDrain({ force: false })}
            className="btn-sm"
            disabled={!canWrite || isBusy || selectedNodeNames.length === 0}
          >
            Drain Selected
          </button>
          <button
            onClick={() => void bulkDrain({ force: true })}
            className="btn-sm"
            disabled={!canWrite || isBusy || selectedNodeNames.length === 0}
          >
            Force Drain
          </button>
          <button onClick={clearNodeSelection} className="btn-sm" disabled={selectedNodeNames.length === 0}>
            Clear Selection
          </button>
        </div>
      </section>

      <NodesTable
        nodes={filteredNodes}
        selectedNodeNames={selectedNodeNames}
        isLoading={isLoading}
        canRead={canRead}
        canWrite={canWrite}
        onToggleNodeSelection={toggleNodeSelection}
        onToggleSelectAllVisible={toggleSelectAllVisible}
        onOpenDetail={openDetail}
        onCordon={cordon}
        onUncordon={uncordon}
        onPreviewDrain={previewDrain}
        onDrain={drain}
      />

      <NodeDetailModal
        selectedNode={selectedNode}
        nodePods={selectedNodePods}
        nodeEvents={selectedNodeEvents}
        lastDrainPreview={lastDrainPreview}
        isBusy={isBusy}
        onCordon={cordon}
        onUncordon={uncordon}
        onPreviewDrain={previewDrain}
        onDrain={drain}
        onClose={clearSelectedNode}
      />
    </div>
  );
}

function lifecycleBadgeClass(status: "active" | "acknowledged" | "snoozed" | "dismissed"): string {
  if (status === "acknowledged") {
    return "border-[#00d4a8]/40 bg-[#00d4a8]/12 text-zinc-100";
  }
  if (status === "snoozed") {
    return "border-[#eab308]/45 bg-[#eab308]/12 text-zinc-100";
  }
  if (status === "dismissed") {
    return "border-zinc-700 bg-zinc-800/70 text-zinc-300";
  }
  return "border-[#ff4444]/45 bg-[#ff4444]/12 text-zinc-100";
}
