import * as React from "react";

type Point = { hourStart: string; leads: number; leadsCompare?: number };

function buildPath(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) return "";
  const d: string[] = [];
  d.push(`M ${points[0].x} ${points[0].y}`);
  for (let i = 1; i < points.length; i++) d.push(`L ${points[i].x} ${points[i].y}`);
  return d.join(" ");
}

export default function LineChart(props: {
  data: Point[];
  height?: number;
  accentCssVar?: string; // e.g. --tenant-accent
}) {
  const { data, height = 220, accentCssVar = "--tenant-accent" } = props;

  const width = 900; // viewBox width
  const padX = 24;
  const padY = 18;

  const max = Math.max(1, ...data.map((d) => d.leads), ...data.map((d) => d.leadsCompare ?? 0));
  const xStep = data.length <= 1 ? 1 : (width - padX * 2) / (data.length - 1);

  const y = (v: number) => {
    const t = v / max;
    return padY + (height - padY * 2) * (1 - t);
  };

  const ptsMain = data.map((d, i) => ({ x: padX + i * xStep, y: y(d.leads) }));
  const ptsCmp = data.map((d, i) => ({ x: padX + i * xStep, y: y(d.leadsCompare ?? 0) }));

  const showCompare = data.some((d) => typeof d.leadsCompare === "number");

  // Labels (every 3 hours)
  const labels = data
    .map((d, i) => {
      const dt = new Date(d.hourStart);
      const hh = dt.toLocaleString("de-CH", { hour: "2-digit", hour12: false });
      return { i, hh };
    })
    .filter((x) => x.i === 0 || x.i === data.length - 1 || x.i % 3 === 0);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-medium text-slate-900">Leads pro Stunde</div>
        {showCompare ? <div className="text-xs text-slate-500">Vergleich (grau)</div> : null}
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="h-[220px] w-full">
        {/* subtle grid */}
        {[0.25, 0.5, 0.75].map((t) => {
          const yy = padY + (height - padY * 2) * t;
          return <line key={t} x1={padX} x2={width - padX} y1={yy} y2={yy} stroke="#e5e7eb" strokeWidth="1" />;
        })}

        {showCompare ? (
          <path d={buildPath(ptsCmp)} fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        ) : null}

        <path
          d={buildPath(ptsMain)}
          fill="none"
          stroke={`var(${accentCssVar}, #0ea5e9)`}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* last dot */}
        {ptsMain.length > 0 ? (
          <circle cx={ptsMain[ptsMain.length - 1].x} cy={ptsMain[ptsMain.length - 1].y} r="4" fill={`var(${accentCssVar}, #0ea5e9)`} />
        ) : null}

        {/* x labels */}
        {labels.map((l) => {
          const x = padX + l.i * xStep;
          return (
            <text key={l.i} x={x} y={height - 4} textAnchor="middle" fontSize="12" fill="#64748b">
              {l.hh}
            </text>
          );
        })}
      </svg>

      <div className="mt-2 text-xs text-slate-500">Peak-Zeiten erkennen, Personalplanung optimieren.</div>
    </div>
  );
}
