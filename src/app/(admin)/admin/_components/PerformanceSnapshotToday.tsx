import { MiniTrafficChart } from "./MiniTrafficChart";

function StatFigure(props: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="text-sm text-slate-600">{props.label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{props.value}</div>
    </div>
  );
}

export function PerformanceSnapshotToday(props: {
  leadsToday: number;
  withCardToday: number;
  exportsToday: number;
  leadsPerHour: number[];
}) {
  const showMiniChart = props.leadsPerHour.some((v) => v > 0);

  return (
    <section className="mt-6">
      <div className="mb-3 text-sm font-medium text-slate-900">Performance (Heute)</div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatFigure label="Leads heute" value={props.leadsToday} />
        <StatFigure label="Mit Visitenkarte" value={props.withCardToday} />
        <StatFigure label="Exporte" value={props.exportsToday} />
      </div>

      <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-5">
        {showMiniChart ? <MiniTrafficChart series={props.leadsPerHour} /> : <div className="text-sm text-slate-600">Noch keine Leads heute.</div>}
      </div>
    </section>
  );
}
