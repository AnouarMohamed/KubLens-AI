import type { ApiMetricsSnapshot } from "../../../types";
import { formatBytes } from "../utils";

interface MetricsRouteSectionsProps {
  apiMetrics: ApiMetricsSnapshot | null;
  slowRoutes: Array<{ route: string; avgLatencyMs: number; normalized: number }>;
}

export function MetricsRouteSections({ apiMetrics, slowRoutes }: MetricsRouteSectionsProps) {
  return (
    <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <section className="xl:col-span-2 rounded-xl border border-zinc-700 bg-zinc-900 p-4">
        <h3 className="text-sm font-semibold text-zinc-100">API Route Details</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-zinc-800/70 text-xs uppercase tracking-wide text-zinc-400">
              <tr>
                <th className="px-3 py-2 font-semibold">Route</th>
                <th className="px-3 py-2 font-semibold">Requests</th>
                <th className="px-3 py-2 font-semibold">Errors</th>
                <th className="px-3 py-2 font-semibold">Avg Latency</th>
                <th className="px-3 py-2 font-semibold">Max Latency</th>
                <th className="px-3 py-2 font-semibold">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800 text-zinc-200">
              {(apiMetrics?.routes ?? []).slice(0, 12).map((route) => (
                <tr key={route.route} className="hover:bg-zinc-800/40">
                  <td className="px-3 py-2 font-medium">{route.route}</td>
                  <td className="px-3 py-2">{route.requests}</td>
                  <td className="px-3 py-2">{route.errors}</td>
                  <td className="px-3 py-2">{route.avgLatencyMs.toFixed(2)}ms</td>
                  <td className="px-3 py-2">{route.maxLatencyMs.toFixed(2)}ms</td>
                  <td className="px-3 py-2">{formatBytes(route.bytes)}</td>
                </tr>
              ))}
              {(apiMetrics?.routes.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-zinc-500">
                    Route metrics are empty. Generate traffic and refresh.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-700 bg-zinc-900 p-4">
        <h3 className="text-sm font-semibold text-zinc-100">Slowest Routes</h3>
        <p className="text-xs text-zinc-400 mt-1">Average latency ranking.</p>
        <div className="mt-4 space-y-3">
          {slowRoutes.map((route, index) => (
            <div key={route.route} className="rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-medium text-zinc-100 truncate">
                  {index + 1}. {route.route}
                </span>
                <span className="text-zinc-300">{route.avgLatencyMs.toFixed(2)}ms</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-zinc-800 overflow-hidden">
                <div className="h-full bg-[#00d4a8]" style={{ width: `${route.normalized}%` }} />
              </div>
            </div>
          ))}
          {slowRoutes.length === 0 && <p className="text-sm text-zinc-500">No route latency data available.</p>}
        </div>
      </section>
    </section>
  );
}
