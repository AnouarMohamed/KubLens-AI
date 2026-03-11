import { MemoryBanner } from "./components/MemoryBanner";
import { MemoryFixPatternsPanel } from "./components/MemoryFixPatternsPanel";
import { MemoryFixRecorder } from "./components/MemoryFixRecorder";
import { MemoryHeader } from "./components/MemoryHeader";
import { MemoryRunbookEditor } from "./components/MemoryRunbookEditor";
import { MemoryRunbooksPanel } from "./components/MemoryRunbooksPanel";
import { useMemoryData } from "./hooks/useMemoryData";

export default function MemoryView() {
  const {
    canRead,
    canWrite,
    query,
    runbooks,
    fixes,
    editingID,
    runbookForm,
    fixForm,
    isLoading,
    isActing,
    error,
    message,
    setQuery,
    updateRunbookForm,
    updateFixForm,
    searchRunbooks,
    searchFixes,
    startEditingRunbook,
    resetRunbookForm,
    saveRunbook,
    saveFix,
  } = useMemoryData();

  return (
    <div className="space-y-4">
      <MemoryHeader
        query={query}
        isLoading={isLoading}
        isActing={isActing}
        onQueryChange={setQuery}
        onSearchRunbooks={() => void searchRunbooks()}
        onSearchFixes={() => void searchFixes()}
      />

      {message && <MemoryBanner tone="ok" text={message} />}
      {error && <MemoryBanner tone="err" text={error} />}

      <section className="grid gap-4 lg:grid-cols-2">
        <MemoryRunbooksPanel
          runbooks={runbooks}
          isLoading={isLoading}
          canWrite={canWrite}
          onEdit={startEditingRunbook}
        />

        <MemoryRunbookEditor
          editingID={editingID}
          runbookForm={runbookForm}
          canWrite={canWrite}
          isActing={isActing}
          onChange={updateRunbookForm}
          onSave={() => void saveRunbook()}
          onReset={resetRunbookForm}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <MemoryFixRecorder
          fixForm={fixForm}
          canWrite={canWrite}
          isActing={isActing}
          onChange={updateFixForm}
          onSave={() => void saveFix()}
        />

        <MemoryFixPatternsPanel fixes={fixes} />
      </section>

      {!canRead && <MemoryBanner tone="err" text="Authenticate to view memory data." />}
    </div>
  );
}
