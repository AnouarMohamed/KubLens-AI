interface MemoryHeaderProps {
  query: string;
  isLoading: boolean;
  isActing: boolean;
  onQueryChange: (value: string) => void;
  onSearchRunbooks: () => void;
  onSearchFixes: () => void;
}

export function MemoryHeader({
  query,
  isLoading,
  isActing,
  onQueryChange,
  onSearchRunbooks,
  onSearchFixes,
}: MemoryHeaderProps) {
  return (
    <header className="panel-head">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-zinc-100">Cluster Memory</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Search team runbooks and store durable fix patterns from resolved incidents.
        </p>
      </div>
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search title, tags, description"
          className="field w-80"
        />
        <button onClick={onSearchRunbooks} disabled={isLoading || isActing} className="btn">
          {isLoading ? "Loading" : "Search"}
        </button>
        <button onClick={onSearchFixes} disabled={isActing} className="btn">
          Search Fixes
        </button>
      </div>
    </header>
  );
}
