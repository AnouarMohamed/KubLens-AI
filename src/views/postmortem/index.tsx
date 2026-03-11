import { Fragment, type ReactNode, useCallback, useEffect, useState } from "react";
import { useAuthSession } from "../../context/AuthSessionContext";
import { api } from "../../lib/api";
import type { Postmortem } from "../../types";

export default function PostmortemView() {
  const { can } = useAuthSession();
  const canRead = can("read");

  const [items, setItems] = useState<Postmortem[]>([]);
  const [selected, setSelected] = useState<Postmortem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!canRead) {
      setItems([]);
      setError("Authenticate to view postmortems.");
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const data = await api.listPostmortems();
      setItems(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load postmortems");
    } finally {
      setIsLoading(false);
    }
  }, [canRead]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openDetail = async (id: string) => {
    try {
      const data = await api.getPostmortem(id);
      setSelected(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load postmortem");
    }
  };

  if (selected) {
    return (
      <div className="space-y-4">
        <header className="panel-head">
          <div>
            <button onClick={() => setSelected(null)} className="btn-sm border-zinc-600">
              Back to Postmortems
            </button>
            <h2 className="mt-2 text-2xl font-semibold text-zinc-100 tracking-tight">{selected.incidentTitle}</h2>
            <p className="text-sm text-zinc-400 mt-1">
              {selected.id} • {selected.duration} • {selected.method.toUpperCase()}
            </p>
          </div>
          <button onClick={() => void openDetail(selected.id)} className="btn">
            Refresh
          </button>
        </header>

        {error && (
          <div className="rounded-md border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-200">
            {error}
          </div>
        )}

        <SectionCard title="Root Cause">
          <SimpleMarkdown text={selected.rootCause} />
        </SectionCard>
        <SectionCard title="Impact">
          <SimpleMarkdown text={selected.impact} />
        </SectionCard>
        <SectionCard title="Prevention">
          <SimpleMarkdown text={selected.prevention} />
        </SectionCard>

        <SectionCard title="Timeline">
          <ol className="space-y-2">
            {selected.timeline.map((entry, index) => (
              <li
                key={`${entry.timestamp}-${index}`}
                className="rounded-md border border-zinc-700 bg-zinc-900/70 px-3 py-2 text-sm"
              >
                <p className="text-xs text-zinc-500">
                  {formatTimestamp(entry.timestamp)} • {entry.kind} • {entry.source}
                </p>
                <p className="mt-1 text-zinc-100">{entry.summary}</p>
                {entry.resource && <p className="mt-1 text-xs text-zinc-400">{entry.resource}</p>}
              </li>
            ))}
          </ol>
        </SectionCard>

        <SectionCard title="Runbook">
          <ul className="space-y-2">
            {selected.runbook.map((step) => (
              <li key={step.id} className="rounded-md border border-zinc-700 bg-zinc-900/70 px-3 py-2 text-sm">
                <p className="text-zinc-100">
                  {stepStatusIcon(step.status)} {step.title}
                </p>
                <p className="mt-1 text-zinc-300">{step.description}</p>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className="panel-head">
        <div>
          <h2 className="text-2xl font-semibold text-zinc-100 tracking-tight">Postmortems</h2>
          <p className="text-sm text-zinc-400 mt-1">
            Resolved incident analyses with deterministic timelines and optional AI enrichment.
          </p>
        </div>
        <button onClick={() => void refresh()} disabled={isLoading} className="btn">
          {isLoading ? "Loading" : "Refresh"}
        </button>
      </header>

      {error && (
        <div className="rounded-md border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-200">{error}</div>
      )}

      <section className="table-shell">
        <table className="min-w-full text-left text-sm">
          <thead className="table-head table-head-sticky">
            <tr>
              <th className="px-4 py-3 font-semibold">Incident</th>
              <th className="px-4 py-3 font-semibold">Severity</th>
              <th className="px-4 py-3 font-semibold">Duration</th>
              <th className="px-4 py-3 font-semibold">Generated</th>
              <th className="px-4 py-3 font-semibold">Method</th>
              <th className="px-4 py-3 font-semibold">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800 text-zinc-200">
            {items.map((postmortem) => (
              <tr key={postmortem.id} className="table-row">
                <td className="px-4 py-3 font-medium">{postmortem.incidentTitle}</td>
                <td className="px-4 py-3 capitalize">{postmortem.severity}</td>
                <td className="px-4 py-3">{postmortem.duration}</td>
                <td className="px-4 py-3 text-zinc-400">{formatTimestamp(postmortem.generatedAt)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] uppercase ${
                      postmortem.method === "ai"
                        ? "border-[var(--accent)]/50 bg-[var(--accent)]/15 text-zinc-100"
                        : "border-zinc-600 bg-zinc-800/60 text-zinc-200"
                    }`}
                  >
                    {postmortem.method}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => void openDetail(postmortem.id)} className="btn-sm border-zinc-600">
                    View
                  </button>
                </td>
              </tr>
            ))}
            {!isLoading && items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                  No postmortems generated yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="surface p-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">{title}</h3>
      <div className="mt-3 text-sm text-zinc-200">{children}</div>
    </section>
  );
}

function stepStatusIcon(status: string): string {
  switch (status) {
    case "in_progress":
      return "🔄";
    case "done":
      return "✅";
    case "skipped":
      return "⏭";
    default:
      return "⬜";
  }
}

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

function SimpleMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const nodes: ReactNode[] = [];
  let paragraphLines: string[] = [];
  let listItems: string[] = [];

  const flushParagraph = () => {
    if (paragraphLines.length === 0) {
      return;
    }
    const value = paragraphLines.join(" ").trim();
    if (value !== "") {
      nodes.push(
        <p key={`p-${nodes.length}`} className="mb-2 leading-relaxed">
          {renderBoldInline(value)}
        </p>,
      );
    }
    paragraphLines = [];
  };

  const flushList = () => {
    if (listItems.length === 0) {
      return;
    }
    nodes.push(
      <ul key={`ul-${nodes.length}`} className="mb-2 list-disc pl-5 space-y-1">
        {listItems.map((item, index) => (
          <li key={`li-${index}`}>{renderBoldInline(item)}</li>
        ))}
      </ul>,
    );
    listItems = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (line === "") {
      flushParagraph();
      flushList();
      continue;
    }
    if (line.startsWith("- ")) {
      flushParagraph();
      listItems.push(line.slice(2).trim());
      continue;
    }
    flushList();
    paragraphLines.push(line);
  }

  flushParagraph();
  flushList();

  return <>{nodes}</>;
}

function renderBoldInline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts
    .filter((part) => part !== "")
    .map((part, index) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        const content = part.slice(2, -2);
        return <strong key={`b-${index}`}>{content}</strong>;
      }
      return <Fragment key={`t-${index}`}>{part}</Fragment>;
    });
}
