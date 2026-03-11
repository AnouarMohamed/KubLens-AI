import type { View } from "../../types";
import { ResourceCatalogSummary } from "./components/ResourceCatalogSummary";
import { ResourceCatalogHeader } from "./components/ResourceCatalogHeader";
import { ResourceScaleModal, ResourceYAMLEditorModal } from "./components/ResourceCatalogModals";
import { ResourceCatalogTable } from "./components/ResourceCatalogTable";
import { useResourceCatalogData } from "./hooks/useResourceCatalogData";

export default function ResourceCatalog({ view }: { view: View }) {
  const {
    meta,
    canRead,
    canWrite,
    resources,
    search,
    isLoading,
    isActing,
    error,
    message,
    yamlTarget,
    yamlText,
    scaleTarget,
    scaleReplicas,
    filtered,
    hasWorkloadActions,
    isScaleableView,
    isRestartableView,
    isRollbackView,
    setSearch,
    setYAMLTarget,
    setYAMLText,
    setScaleTarget,
    setScaleReplicas,
    load,
    openYAMLEditor,
    applyYAML,
    openScaleEditor,
    applyScale,
    restartResource,
    rollbackResource,
  } = useResourceCatalogData(view);

  return (
    <div className="space-y-5">
      <ResourceCatalogHeader
        title={meta.label}
        description={meta.description}
        search={search}
        isLoading={isLoading}
        isActing={isActing}
        canRead={canRead}
        onSearchChange={setSearch}
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

      <ResourceCatalogSummary resources={resources} filteredCount={filtered.length} />

      <ResourceCatalogTable
        resources={filtered}
        isLoading={isLoading}
        isActing={isActing}
        canWrite={canWrite}
        hasWorkloadActions={hasWorkloadActions}
        isScaleableView={isScaleableView}
        isRestartableView={isRestartableView}
        isRollbackView={isRollbackView}
        onOpenYAMLEditor={openYAMLEditor}
        onOpenScaleEditor={openScaleEditor}
        onRestartResource={restartResource}
        onRollbackResource={rollbackResource}
      />

      <ResourceYAMLEditorModal
        view={view}
        yamlTarget={yamlTarget}
        yamlText={yamlText}
        isActing={isActing}
        canWrite={canWrite}
        onClose={() => setYAMLTarget(null)}
        onYAMLChange={setYAMLText}
        onApply={() => void applyYAML()}
      />

      <ResourceScaleModal
        view={view}
        scaleTarget={scaleTarget}
        scaleReplicas={scaleReplicas}
        isActing={isActing}
        canWrite={canWrite}
        onClose={() => setScaleTarget(null)}
        onReplicasChange={setScaleReplicas}
        onScale={() => void applyScale()}
      />
    </div>
  );
}
