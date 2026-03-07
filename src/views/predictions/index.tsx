import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, api } from "../../lib/api";
import type { IncidentPrediction, PredictionsResult } from "../../types";

export default function Predictions() {
  const [payload, setPayload] = useState<PredictionsResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    setIsLoading(true);
    try {
      const response = await api.getPredictions(force);
      setPayload(response);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setError("Predictions endpoint is missing on the running backend. Restart API to load latest code.");
      } else {
        setError(err instanceof Error ? err.message : "Failed to load predictions");
      }
      setPayload(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) {
      return;
    }

    const timer = window.setInterval(() => void load(false), 20000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, load]);

  const items = useMemo(() => payload?.items ?? [], [payload]);
  const summary = useMemo(() => summarize(items), [items]);
  const topItems = useMemo(() => items.slice(0, 3), [items]);

  return (
    <div className="space-y-5">
      <header className="surface p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-zinc-100 tracking-tight">Predictive Incidents</h2>
            <p className="text-sm text-zinc-400 mt-1">Forecasted incidents ranked by risk and confidence.</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs text-zinc-300 rounded-lg border border-zinc-700 px-3 py-2 bg-zinc-800/70">
              <input type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} />
              <span className="ml-2">Auto refresh</span>
            </label>
            <button
              onClick={() => void load(true)}
              disabled={isLoading}
              className="h-10 rounded-xl border border-zinc-700 px-4 text-sm font-medium text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
            >
              {isLoading ? "Refreshing" : "Refresh"}
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div className="rounded-xl border border-[#eab308]/45 bg-[#eab308]/12 px-3 py-2 text-sm text-zinc-100">
          {error}
        </div>
      )}

      <section className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <StatCard label="Prediction Source" value={payload?.source ?? "-"} badge={sourceBadge(payload?.source)} />
        <StatCard label="Total Predictions" value={String(summary.total)} />
        <StatCard label="High Risk (80+)" value={String(summary.high)} />
        <StatCard label="Medium Risk (60-79)" value={String(summary.medium)} />
        <StatCard label="Generated At" value={formatTimestamp(payload?.generatedAt)} />
      </section>

      <section className="surface p-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-zinc-100">Risk Distribution</h3>
          <p className="text-xs text-zinc-500">
            High {summary.high} | Medium {summary.medium} | Low {summary.low}
          </p>
        </div>
        <div className="mt-3 h-4 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-800">
          <div className="h-full flex">
            <div className="bg-[#d946ef]" style={{ width: `${summary.highPct}%` }} />
            <div className="bg-[#eab308]" style={{ width: `${summary.mediumPct}%` }} />
            <div className="bg-[#34c759]" style={{ width: `${summary.lowPct}%` }} />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {topItems.map((item) => (
          <article key={item.id} className="surface p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-zinc-100">
                {item.resourceKind}: {item.resource}
              </p>
              <RiskBadge score={item.riskScore} />
            </div>
            {item.namespace && <p className="text-xs text-zinc-500 mt-1">{item.namespace}</p>}
            <p className="text-sm text-zinc-300 mt-3">{item.summary}</p>
            <p className="text-sm text-zinc-200 mt-2">
              <span className="font-semibold">Action:</span> {item.recommendation}
            </p>
            <p className="text-xs text-zinc-500 mt-2">Confidence: {item.confidence}%</p>
          </article>
        ))}
        {topItems.length === 0 && (
          <article className="surface p-4 xl:col-span-3">
            <p className="text-sm text-zinc-400">
              No high-signal predictions yet. Generate cluster activity and refresh.
            </p>
          </article>
        )}
      </section>

      <section className="surface p-5">
        <h3 className="text-sm font-semibold text-zinc-100">Risk Forecast Table</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-zinc-800/70 text-xs uppercase tracking-wide text-zinc-400">
              <tr>
                <th className="px-3 py-2 font-semibold">Risk</th>
                <th className="px-3 py-2 font-semibold">Confidence</th>
                <th className="px-3 py-2 font-semibold">Resource</th>
                <th className="px-3 py-2 font-semibold">Summary</th>
                <th className="px-3 py-2 font-semibold">Recommendation</th>
                <th className="px-3 py-2 font-semibold">Signals</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800 text-zinc-200">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-zinc-800/40 align-top">
                  <td className="px-3 py-2">
                    <RiskBadge score={item.riskScore} />
                  </td>
                  <td className="px-3 py-2">{item.confidence}%</td>
                  <td className="px-3 py-2">
                    <p className="font-medium">
                      {item.resourceKind}: {item.resource}
                    </p>
                    {item.namespace && <p className="text-xs text-zinc-500 mt-0.5">{item.namespace}</p>}
                  </td>
                  <td className="px-3 py-2 text-zinc-300">{item.summary}</td>
                  <td className="px-3 py-2 text-zinc-300">{item.recommendation}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1.5">
                      {(item.signals ?? []).map((signal) => (
                        <span
                          key={`${item.id}-${signal.key}`}
                          className="rounded-md border border-zinc-700 bg-zinc-800/70 px-2 py-0.5 text-[11px] text-zinc-300"
                        >
                          {signal.key}: {signal.value}
                        </span>
                      ))}
                      {(item.signals?.length ?? 0) === 0 && <span className="text-xs text-zinc-500">none</span>}
                    </div>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-zinc-500">
                    No predictions available.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  badge,
}: {
  label: string;
  value: string;
  badge?: { text: string; className: string };
}) {
  return (
    <div className="kpi">
      <p className="text-[11px] uppercase tracking-wide text-zinc-500 font-semibold">{label}</p>
      <p className="mt-2 text-xl font-semibold text-zinc-100 break-words">{value}</p>
      {badge && (
        <span
          className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badge.className}`}
        >
          {badge.text}
        </span>
      )}
    </div>
  );
}

function RiskBadge({ score }: { score: number }) {
  let className = "border-[#34c759]/45 bg-[#34c759]/14";
  if (score >= 80) {
    className = "border-[#d946ef]/45 bg-[#d946ef]/14";
  } else if (score >= 60) {
    className = "border-[#eab308]/45 bg-[#eab308]/14";
  }

  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold text-zinc-100 ${className}`}>{score}</span>
  );
}

function summarize(items: IncidentPrediction[]) {
  let high = 0;
  let medium = 0;
  let low = 0;

  for (const item of items) {
    if (item.riskScore >= 80) {
      high++;
    } else if (item.riskScore >= 60) {
      medium++;
    } else {
      low++;
    }
  }

  const total = items.length || 1;
  return {
    total: items.length,
    high,
    medium,
    low,
    highPct: (high / total) * 100,
    mediumPct: (medium / total) * 100,
    lowPct: (low / total) * 100,
  };
}

function formatTimestamp(value?: string): string {
  if (!value) {
    return "n/a";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

function sourceBadge(source?: string): { text: string; className: string } | undefined {
  if (!source) {
    return undefined;
  }

  const normalized = source.toLowerCase();
  if (normalized.includes("python")) {
    return { text: "live predictor", className: "border-[#34c759]/45 bg-[#34c759]/14 text-zinc-100" };
  }
  if (normalized.includes("fallback")) {
    return { text: "fallback", className: "border-[#eab308]/45 bg-[#eab308]/14 text-zinc-100" };
  }
  return { text: "custom", className: "border-zinc-600 bg-zinc-800/70 text-zinc-100" };
}
