interface ResourceCatalogHeaderProps {
  title: string;
  description: string;
  search: string;
  isLoading: boolean;
  isActing: boolean;
  canRead: boolean;
  onSearchChange: (value: string) => void;
  onRefresh: () => void;
}

export function ResourceCatalogHeader({
  title,
  description,
  search,
  isLoading,
  isActing,
  canRead,
  onSearchChange,
  onRefresh,
}: ResourceCatalogHeaderProps) {
  return (
    <header className="panel-head">
      <div>
        <h2 className="text-2xl font-semibold text-zinc-100 tracking-tight">{title}</h2>
        <p className="text-sm text-zinc-400 mt-1">{description}</p>
      </div>
      <div className="flex gap-2">
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search"
          className="field w-72"
        />
        <button onClick={onRefresh} disabled={isLoading || isActing || !canRead} className="btn">
          {isLoading ? "Loading" : "Refresh"}
        </button>
      </div>
    </header>
  );
}
