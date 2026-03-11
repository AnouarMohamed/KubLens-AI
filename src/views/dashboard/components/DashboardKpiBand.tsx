interface DashboardKpi {
  label: string;
  value: string;
  critical: boolean;
}

interface DashboardKpiBandProps {
  kpis: DashboardKpi[];
}

export function DashboardKpiBand({ kpis }: DashboardKpiBandProps) {
  return (
    <section className="flex items-stretch border border-[#1f1f1f] rounded-lg overflow-hidden mb-6">
      {kpis.map((kpi, index) => (
        <div key={kpi.label} className={`flex-1 px-5 py-4 ${index > 0 ? "border-l border-[#1f1f1f]" : ""}`}>
          <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-[#444444]">{kpi.label}</p>
          <p
            className={`mt-1.5 text-2xl font-mono font-semibold ${kpi.critical ? "text-[#ff4444]" : "text-[#e8e8e8]"}`}
          >
            {kpi.value}
          </p>
        </div>
      ))}
    </section>
  );
}
