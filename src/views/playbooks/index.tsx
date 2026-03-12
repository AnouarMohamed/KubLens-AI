import { useMemo, useState } from "react";
import { PlaybookCard } from "./components/PlaybookCard";
import { PLAYBOOKS } from "./data/playbooks";
import type { PlaybookDomain } from "./types";
import { classifyPlaybook, domainLabel, matchesPlaybookQuery, sortedDomains } from "./utils";

export default function Playbooks() {
  const [query, setQuery] = useState("");
  const [domain, setDomain] = useState<"all" | PlaybookDomain>("all");

  const domains = useMemo(() => sortedDomains(PLAYBOOKS), []);

  const filtered = useMemo(() => {
    return PLAYBOOKS.filter((playbook) => {
      if (domain !== "all" && classifyPlaybook(playbook) !== domain) {
        return false;
      }
      return matchesPlaybookQuery(playbook, query);
    });
  }, [domain, query]);

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
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
          <span>{PLAYBOOKS.length} total playbooks</span>
          <span>{filtered.length} matching current filters</span>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {filtered.map((playbook) => (
          <PlaybookCard key={playbook.id} playbook={playbook} domain={classifyPlaybook(playbook)} />
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
