import { useMemo, useState } from "react";
import { PlaybookCard } from "./components/PlaybookCard";
import { PLAYBOOKS } from "./data/playbooks";
import type { PlaybookDomain } from "./types";
import { classifyPlaybook, domainLabel, matchesPlaybookQuery, playbookUrgency, sortedDomains } from "./utils";

const FAVORITES_STORAGE_KEY = "kubelens.playbook-favorites";

export default function Playbooks() {
  const [query, setQuery] = useState("");
  const [domain, setDomain] = useState<"all" | PlaybookDomain>("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [sortBy, setSortBy] = useState<"default" | "urgency" | "title">("default");
  const [favoriteIDs, setFavoriteIDs] = useState<string[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }
    try {
      const raw = window.localStorage.getItem(FAVORITES_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.filter((item): item is string => typeof item === "string");
    } catch {
      return [];
    }
  });

  const domains = useMemo(() => sortedDomains(PLAYBOOKS), []);

  const filtered = useMemo(() => {
    const filteredRows = PLAYBOOKS.filter((playbook) => {
      if (domain !== "all" && classifyPlaybook(playbook) !== domain) {
        return false;
      }
      if (favoritesOnly && !favoriteIDs.includes(playbook.id)) {
        return false;
      }
      return matchesPlaybookQuery(playbook, query);
    });

    if (sortBy === "title") {
      return [...filteredRows].sort((left, right) => left.title.localeCompare(right.title));
    }
    if (sortBy === "urgency") {
      const rank = { high: 0, medium: 1, low: 2 } as const;
      return [...filteredRows].sort((left, right) => {
        return rank[playbookUrgency(left)] - rank[playbookUrgency(right)];
      });
    }
    return filteredRows;
  }, [domain, favoriteIDs, favoritesOnly, query, sortBy]);

  const toggleFavorite = (id: string) => {
    setFavoriteIDs((state) => {
      const next = state.includes(id) ? state.filter((item) => item !== id) : [...state, id];
      window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  return (
    <div className="space-y-5">
      <header className="panel-head">
        <div>
          <h2 className="text-2xl font-semibold text-zinc-100 tracking-tight">Playbooks</h2>
          <p className="text-sm text-zinc-400 mt-1">
            Response guides for recurring incidents with practical command sequences.
          </p>
        </div>
      </header>

      <section className="rounded-md border border-zinc-800 bg-zinc-900/60 px-4 py-3 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by symptom, command, or objective"
            className="input flex-1 min-w-[240px]"
          />
          <select
            value={domain}
            onChange={(event) => setDomain(event.target.value as "all" | PlaybookDomain)}
            className="input w-[180px]"
          >
            <option value="all">All Domains</option>
            {domains.map((item) => (
              <option key={item} value={item}>
                {domainLabel(item)}
              </option>
            ))}
          </select>
          <select value={sortBy} onChange={(event) => setSortBy(event.target.value as "default" | "urgency" | "title")} className="input w-[180px]">
            <option value="default">Sort: Default</option>
            <option value="urgency">Sort: Urgency</option>
            <option value="title">Sort: Title</option>
          </select>
          <button onClick={() => setFavoritesOnly((state) => !state)} className="btn-sm border-zinc-600">
            {favoritesOnly ? "Show All" : "Favorites Only"}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
          <span>{PLAYBOOKS.length} total playbooks</span>
          <span>{filtered.length} matching current filters</span>
          <span>{favoriteIDs.length} saved</span>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {filtered.map((playbook) => (
          <PlaybookCard
            key={playbook.id}
            playbook={playbook}
            domain={classifyPlaybook(playbook)}
            urgency={playbookUrgency(playbook)}
            isFavorite={favoriteIDs.includes(playbook.id)}
            onToggleFavorite={toggleFavorite}
          />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="rounded-md border border-zinc-800 bg-zinc-900/60 px-4 py-8 text-center text-sm text-zinc-500">
          No playbooks match the current query and domain filter.
        </div>
      )}
    </div>
  );
}
