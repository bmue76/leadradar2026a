export function MiniTrafficChart(props: { series: number[] }) {
  const s = props.series.length === 24 ? props.series : Array.from({ length: 24 }, (_, i) => props.series[i] ?? 0);
  const max = Math.max(1, ...s);

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>Leads pro Stunde</span>
        <span>heute</span>
      </div>

      <div className="mt-2 flex h-10 items-end gap-[2px]">
        {s.map((v, i) => {
          const h = Math.round((v / max) * 100);
          return (
            <div key={i} className="flex-1">
              <div
                className="w-full rounded-sm bg-slate-200"
                style={{ height: `${Math.max(6, Math.min(100, h))}%` }}
                aria-label={`Stunde ${i}: ${v} Leads`}
                title={`${i}:00 · ${v}`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
