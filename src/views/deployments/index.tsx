import { DeploymentSummary } from "./components/DeploymentSummary";
import { DeploymentDetailModal, DeploymentScaleModal, DeploymentYAMLEditorModal } from "./components/DeploymentModals";
import { DeploymentsHeader } from "./components/DeploymentsHeader";
import { DeploymentsTable } from "./components/DeploymentsTable";
import { useDeploymentsData } from "./hooks/useDeploymentsData";

export default function Deployments() {
  const {
    canRead,
    canWrite,
    items,
    search,
    namespaceFilter,
    isLoading,
    isActing,
    error,
    message,
    scaleTarget,
    scaleReplicas,
    detail,
    yamlEditor,
    namespaces,
    filtered,
    setSearch,
    setNamespaceFilter,
    setScaleTarget,
    setScaleReplicas,
    setDetail,
    setYAMLEditor,
    updateYAMLEditorContent,
    load,
    openDetail,
    openYAMLEditor,
    applyYAML,
    scale,
    restart,
    rollback,
  } = useDeploymentsData();

  return (
    <div className="space-y-5">
      <DeploymentsHeader
        search={search}
        namespaceFilter={namespaceFilter}
        namespaces={namespaces}
        isLoading={isLoading}
        isActing={isActing}
        canRead={canRead}
        onSearchChange={setSearch}
        onNamespaceFilterChange={setNamespaceFilter}
        onRefresh={() => void load()}
      />

      {message && (
        <div className="rounded-xl border border-[#00d4a8]/40 bg-[#00d4a8]/12 px-3 py-2 text-sm text-zinc-100">
          {message}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-200">{error}</div>
      )}

      <DeploymentSummary items={items} filteredCount={filtered.length} />

      <DeploymentsTable
        items={filtered}
        isLoading={isLoading}
        isActing={isActing}
        canWrite={canWrite}
        onOpenDetail={openDetail}
        onOpenScale={setScaleTarget}
        onRestart={restart}
        onRollback={rollback}
        onOpenYAMLEditor={openYAMLEditor}
      />

      <DeploymentDetailModal detail={detail} onClose={() => setDetail(null)} />

      <DeploymentYAMLEditorModal
        yamlEditor={yamlEditor}
        canWrite={canWrite}
        isActing={isActing}
        onClose={() => setYAMLEditor(null)}
        onYAMLChange={updateYAMLEditorContent}
        onApply={() => void applyYAML()}
      />

      <DeploymentScaleModal
        scaleTarget={scaleTarget}
        scaleReplicas={scaleReplicas}
        canWrite={canWrite}
        isActing={isActing}
        onClose={() => setScaleTarget(null)}
        onReplicasChange={setScaleReplicas}
        onScale={() => void scale()}
      />
    </div>
  );
}
