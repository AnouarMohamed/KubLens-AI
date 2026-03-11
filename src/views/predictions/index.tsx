import { PredictionsHeader } from "./components/PredictionsHeader";
import { PredictionsSummary } from "./components/PredictionsSummary";
import { PredictionsTable } from "./components/PredictionsTable";
import { usePredictionsData } from "./hooks/usePredictionsData";

export default function Predictions() {
  const { payload, isLoading, autoRefresh, error, items, topItems, summary, setAutoRefresh, load } =
    usePredictionsData();

  return (
    <div className="space-y-5">
      <PredictionsHeader
        autoRefresh={autoRefresh}
        isLoading={isLoading}
        onAutoRefreshChange={setAutoRefresh}
        onRefresh={() => void load(true)}
      />

      {error && (
        <div className="rounded-xl border border-[#eab308]/45 bg-[#eab308]/12 px-3 py-2 text-sm text-zinc-100">
          {error}
        </div>
      )}

      <PredictionsSummary payload={payload} summary={summary} topItems={topItems} />
      <PredictionsTable items={items} />
    </div>
  );
}
