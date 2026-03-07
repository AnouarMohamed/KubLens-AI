import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import type { IncidentPrediction, PredictionsResult } from "../types";

export default function Predictions() {
  const [payload, setPayload] = useState<PredictionsResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await api.getPredictions();
      setPayload(response);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load predictions");
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

    const timer = window.setInterval(() => void load(), 20000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, load]);

  const items = payload?.items ?? [];
  const summary = useMemo(() => summarize(items), [items]);

  return (
    <div className="space-y-5">
      <header className="surface p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-zinc-100 tracking-tight">Predictive Incidents</h2>
            <p className="text-sm text-zinc-400 mt-1">Risk forecasts for pods and nodes based on live cluster behavior.</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs text-zinc-300 rounded-lg border border-zinc-700 px-3 py-2 bg-zinc-800/70">
              <input type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} />
              <span className="ml-2">Auto refresh</span>
            </label>
            <button
              onClick={() => void load()}
              disabled={isLoading}
              className="h-10 rounded-xl border border-zinc-700 px-4 text-sm font-medium text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
            >
              {isLoading ? "Refreshing" : "Refresh"}
            </button>
          </div>
        </div>
      </header>

      {error && <div className="rounded-xl border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-200">{error}</div>}

      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard label="Prediction Source" value={payload?.source ?? "-"} />
        <StatCard label="Total Predictions" value={String(summary.total)} />
        <StatCard label="High Risk (80+)" value={String(summary.high)} />
        <StatCard label="Medium Risk (60-79)" value={String(summary.medium)} />
      </section>

      <section className="surface p-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-zinc-100">Risk Forecast Table</h3>
          <p className="text-xs text-zinc-500">Generated: {formatTimestamp(payload?.generatedAt)}</p>
        </div>

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
                    <p className="font-medium">{item.resourceKind}: {item.resource}</p>
                    {item.namespace && <p className="text-xs text-zinc-500 mt-0.5">{item.namespace}</p>}
                  </td>
                  <td className="px-3 py-2 text-zinc-300">{item.summary}</td>
                  <td className="px-3 py-2 text-zinc-300">{item.recommendation}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1.5">
                      {(item.signals ?? []).map((signal) => (
                        <span key={`${item.id}-${signal.key}`} className="rounded-md border border-zinc-700 bg-zinc-800/70 px-2 py-0.5 text-[11px] text-zinc-300">
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

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="kpi">
      <p className="text-[11px] uppercase tracking-wide text-zinc-500 font-semibold">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-zinc-100">{value}</p>
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

  return <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold text-zinc-100 ${className}`}>{score}</span>;
}

function summarize(items: IncidentPrediction[]) {
  let high = 0;
  let medium = 0;

  for (const item of items) {
    if (item.riskScore >= 80) {
      high++;
    } else if (item.riskScore >= 60) {
      medium++;
    }
  }

  return { total: items.length, high, medium };
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
