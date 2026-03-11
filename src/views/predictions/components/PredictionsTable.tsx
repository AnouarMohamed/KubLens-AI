import type { IncidentPrediction } from "../../../types";
import { RiskBadge } from "./PredictionsPrimitives";

interface PredictionsTableProps {
  items: IncidentPrediction[];
}

export function PredictionsTable({ items }: PredictionsTableProps) {
  return (
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
              <tr key={item.id} className="align-top hover:bg-zinc-800/40">
                <td className="px-3 py-2">
                  <RiskBadge score={item.riskScore} />
                </td>
                <td className="px-3 py-2">{item.confidence}%</td>
                <td className="px-3 py-2">
                  <p className="font-medium">
                    {item.resourceKind}: {item.resource}
                  </p>
                  {item.namespace && <p className="mt-0.5 text-xs text-zinc-500">{item.namespace}</p>}
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
  );
}
