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
    search,
    isLoading,
    isBusy,
    error,
    setSearch,
    load,
    openDetail,
    cordon,
    uncordon,
    previewDrain,
    drain,
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

      <NodesTable
        nodes={filteredNodes}
        isLoading={isLoading}
        canRead={canRead}
        canWrite={canWrite}
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
        onClose={clearSelectedNode}
      />
    </div>
  );
}
