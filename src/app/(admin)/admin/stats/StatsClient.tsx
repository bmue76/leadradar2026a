"use client";

import { useEffect, useMemo, useState } from "react";

type Status = "NEW" | "REVIEWED";

type StatsOverview = {
  range: "7d" | "14d" | "30d" | "90d";
  timezone: string;
  activeEvent: { id: string; name: string } | null;
  kpis: {
    leadsTotal: number;
    leadsToday: number;
    leadsWeek: number;
    leadsActiveEvent: number | null;
    reviewedCount: number;
    newCount: number;
    ocrCount?: number;
    ocrRate?: number;
  };
  series: {
    leadsByDay: Array<{ day: string; count: number }>;
    leadsByHourToday: Array<{ hour: number; count: number }>;
    leadsByStatus: Array<{ status: Status; count: number }>;
  };
  tops: {
    events: Array<{ id: string; name: string; count: number }>;
    forms: Array<{ id: string; name: string; count: number }>;
  };
};

type ApiOk<T> = { ok: true; data: T; traceId: string };
type ApiErr = { ok: false; error: { code: string; message: string; details?: unknown }; traceId: string };
type ApiResp<T> = ApiOk<T> | ApiErr;

function formatInt(n: number): string {
  return new Intl.NumberFormat("de-CH").format(n);
}

function formatPct(n: number): string {
  return new Intl.NumberFormat("de-CH", { style: "percent", maximumFractionDigits: 0 }).format(n);
}

function rangeDays(range: StatsOverview["range"]): number {
  return Number(range.replace("d", "")) || 30;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function Sparkline(props: { values: number[]; className?: string }) {
  const w = 240;
  const h = 44;
  const pad = 4;

  const max = Math.max(1, ...props.values);
  const min = Math.min(0, ...props.values);
  const span = Math.max(1, max - min);

  const pts = props.values.map((v, i) => {
    const x = pad + (i / Math.max(1, props.values.length - 1)) * (w - pad * 2);
    const y = pad + (1 - (v - min) / span) * (h - pad * 2);
    return { x, y };
  });

  const d = pts
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ");

  // Soft area fill under line (still Apple-clean)
  const area = `${d} L ${(w - pad).toFixed(2)} ${(h - pad).toFixed(2)} L ${pad.toFixed(2)} ${(h - pad).toFixed(2)} Z`;

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className={props.className ?? ""}
      aria-hidden="true"
    >
      <path d={area} className="fill-primary/10" />
      <path d={d} className="stroke-primary" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function HourHeat(props: { hours: Array<{ hour: number; count: number }>; tz: string }) {
  const max = Math.max(1, ...props.hours.map((h) => h.count));
  return (
    <div className="mt-3">
      <div className="flex items-end gap-1">
        {props.hours.map((h) => {
          const height = Math.round((h.count / max) * 42);
          const on = h.count > 0;
          return (
            <div key={h.hour} className="flex flex-col items-center gap-1">
              <div
                className={[
                  "w-[7px] rounded-full",
                  on ? "bg-primary" : "bg-muted",
                ].join(" ")}
                style={{ height: `${clamp(height, 3, 42)}px` }}
                title={`${String(h.hour).padStart(2, "0")}:00 — ${h.count}`}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
        <span>00</span>
        <span>06</span>
        <span>12</span>
        <span>18</span>
        <span>24</span>
      </div>
      <div className="mt-2 text-[11px] text-muted-foreground">Traffic heute (TZ {props.tz})</div>
    </div>
  );
}

function Metric(props: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className="py-2">
      <div className="text-[11px] font-medium tracking-wide text-muted-foreground">{props.label}</div>
      <div className={["mt-1 text-2xl font-semibold tracking-tight tabular-nums", props.accent ? "text-primary" : ""].join(" ")}>
        {props.value}
      </div>
      {props.hint ? <div className="mt-1 text-[11px] text-muted-foreground">{props.hint}</div> : null}
    </div>
  );
}

function Segmented<T extends string>(props: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-full bg-muted/40 p-1">
      {props.options.map((o) => {
        const active = o.value === props.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => props.onChange(o.value)}
            className={[
              "rounded-full px-3 py-1.5 text-sm transition",
              active ? "bg-background text-primary" : "text-foreground hover:text-primary",
            ].join(" ")}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function MinimalList(props: { title: string; rows: Array<{ name: string; count: number }>; empty: string }) {
  return (
    <div className="mt-8">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">{props.title}</h3>
        <div className="text-[11px] text-muted-foreground">Top 5</div>
      </div>
      {!props.rows.length ? (
        <div className="mt-3 text-sm text-muted-foreground">{props.empty}</div>
      ) : (
        <div className="mt-3 space-y-2">
          {props.rows.map((r) => (
            <div
              key={r.name}
              className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-muted/30"
            >
              <div className="min-w-0">
                <div className="truncate text-sm">{r.name}</div>
              </div>
              <div className="tabular-nums text-sm text-muted-foreground">{formatInt(r.count)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function StatsClient() {
  const [range, setRange] = useState<StatsOverview["range"]>("30d");
  const [scope, setScope] = useState<"ACTIVE" | "ALL">("ACTIVE");
  const [refreshKey, setRefreshKey] = useState<number>(0);

  const [data, setData] = useState<StatsOverview | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [err, setErr] = useState<{ message: string; traceId?: string } | null>(null);

  useEffect(() => {
    let cancelled = false;

    const url = `/api/admin/v1/stats/overview?range=${encodeURIComponent(range)}&event=${encodeURIComponent(
      scope
    )}&tz=${encodeURIComponent("Europe/Zurich")}`;

    (async () => {
      try {
        const res = await fetch(url, { method: "GET", cache: "no-store" });
        const json = (await res.json()) as ApiResp<StatsOverview>;
        if (cancelled) return;

        if (!json.ok) {
          setData(null);
          setErr({ message: `${json.error.message} (${json.error.code})`, traceId: json.traceId });
          setLoading(false);
          return;
        }

        setData(json.data);
        setErr(null);
        setLoading(false);
      } catch {
        if (cancelled) return;
        setData(null);
        setErr({ message: "Unexpected error (FETCH_FAILED)" });
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [range, scope, refreshKey]);

  const derived = useMemo(() => {
    if (!data) return null;
    const days = rangeDays(data.range);
    const total = data.kpis.leadsTotal;
    const reviewed = data.kpis.reviewedCount;
    const reviewRate = total > 0 ? reviewed / total : 0;

    const series = data.series.leadsByDay.map((x) => x.count);
    const hourSeries = data.series.leadsByHourToday;

    const peak = hourSeries.reduce<{ hour: number | null; count: number }>(
      (acc, h) => (h.count > acc.count ? { hour: h.hour, count: h.count } : acc),
      { hour: null, count: 0 }
    );

    const avgPerDay = total / Math.max(1, days);

    return {
      days,
      reviewRate,
      avgPerDay,
      peakHour: peak.hour,
      peakCount: peak.count,
      spark: series,
      hours: hourSeries,
    };
  }, [data]);

  if (loading) {
    return (
      <div className="mt-8">
        <div className="h-6 w-64 rounded bg-muted/40" />
        <div className="mt-6 grid grid-cols-2 gap-6 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 rounded bg-muted/30" />
          ))}
        </div>
        <div className="mt-8 h-40 rounded bg-muted/30" />
      </div>
    );
  }

  if (err) {
    return (
      <div className="mt-8">
        <div className="text-sm font-semibold">Couldn’t load stats</div>
        <div className="mt-1 text-sm text-muted-foreground">{err.message}</div>
        {err.traceId ? (
          <div className="mt-2 text-xs text-muted-foreground">
            Trace: <span className="font-mono">{err.traceId}</span>
          </div>
        ) : null}
        <div className="mt-4">
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setRefreshKey((k) => k + 1);
            }}
            className="rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data || !derived) {
    return <div className="mt-8 text-sm text-muted-foreground">Keine Daten.</div>;
  }

  const k = data.kpis;

  return (
    <div className="mt-8">
      {/* Controls */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="text-[11px] text-muted-foreground">
          {scope === "ACTIVE" ? (
            data.activeEvent ? (
              <>
                Aktives Event: <span className="font-medium text-foreground">{data.activeEvent.name}</span>
              </>
            ) : (
              <>Kein aktives Event</>
            )
          ) : (
            <>Alle Events</>
          )}
          <span className="mx-2">·</span>
          TZ <span className="font-medium text-foreground">{data.timezone}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            value={scope}
            options={[
              { value: "ACTIVE", label: "Aktives Event" },
              { value: "ALL", label: "Alle" },
            ]}
            onChange={(v) => {
              setLoading(true);
              setScope(v);
            }}
          />
          <Segmented
            value={range}
            options={[
              { value: "7d", label: "7d" },
              { value: "14d", label: "14d" },
              { value: "30d", label: "30d" },
              { value: "90d", label: "90d" },
            ]}
            onChange={(v) => {
              setLoading(true);
              setRange(v);
            }}
          />
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setRefreshKey((k) => k + 1);
            }}
            className="rounded-full px-3 py-2 text-sm text-foreground hover:bg-muted/40"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Hero: Total + Spark + Today Heat */}
      <div className="mt-8 grid gap-10 md:grid-cols-[1.2fr_0.8fr]">
        <div>
          <div className="text-[11px] font-medium tracking-wide text-muted-foreground">
            Leads (Zeitraum {data.range})
          </div>
          <div className="mt-2 flex items-end gap-3">
            <div className="text-5xl font-semibold tracking-tight tabular-nums">{formatInt(k.leadsTotal)}</div>
            <div className="pb-1 text-sm text-muted-foreground">
              Ø {formatInt(Math.round(derived.avgPerDay))}/Tag
            </div>
          </div>

          <div className="mt-4">
            <Sparkline values={derived.spark} className="max-w-full" />
          </div>

          {/* KPI strip (typographic) */}
          <div className="mt-6 grid grid-cols-2 gap-x-10 gap-y-6 md:grid-cols-4">
            <Metric label="Heute" value={formatInt(k.leadsToday)} accent />
            <Metric label="Diese Woche" value={formatInt(k.leadsWeek)} />
            <Metric
              label="Review Rate"
              value={formatPct(derived.reviewRate)}
              hint={`${formatInt(k.reviewedCount)} reviewed · ${formatInt(k.newCount)} offen`}
            />
            <Metric
              label="OCR"
              value={typeof k.ocrRate === "number" ? formatPct(k.ocrRate) : "—"}
              hint={typeof k.ocrCount === "number" ? `${formatInt(k.ocrCount)} OCR Leads` : "Optional"}
            />
          </div>

          {/* Insights (useful, not decorative) */}
          <div className="mt-8">
            <div className="text-sm font-semibold">Insights</div>
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              <div className="rounded-lg bg-muted/30 px-3 py-2 text-sm">
                Peak Hour{" "}
                <span className="font-medium text-primary">
                  {derived.peakHour === null ? "—" : `${String(derived.peakHour).padStart(2, "0")}:00`}
                </span>
                <span className="text-muted-foreground"> · {formatInt(derived.peakCount)} Leads</span>
              </div>
              <div className="rounded-lg bg-muted/30 px-3 py-2 text-sm">
                Offene Leads{" "}
                <span className="font-medium text-primary">{formatInt(k.newCount)}</span>
                <span className="text-muted-foreground"> · als Nächstes reviewen</span>
              </div>
              <div className="rounded-lg bg-muted/30 px-3 py-2 text-sm">
                Event Scope{" "}
                <span className="font-medium text-primary">{scope}</span>
                <span className="text-muted-foreground">
                  {k.leadsActiveEvent === null ? " · —" : ` · ${formatInt(k.leadsActiveEvent)}`
                  }
                </span>
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="text-[11px] font-medium tracking-wide text-muted-foreground">Traffic</div>
          <div className="mt-2 text-2xl font-semibold tracking-tight">Heute</div>
          <HourHeat hours={derived.hours} tz={data.timezone} />

          <div className="mt-10">
            <div className="text-sm font-semibold">Status</div>
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2">
                <div className="text-sm">NEW</div>
                <div className="tabular-nums text-sm text-muted-foreground">{formatInt(k.newCount)}</div>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2">
                <div className="text-sm">REVIEWED</div>
                <div className="tabular-nums text-sm text-muted-foreground">{formatInt(k.reviewedCount)}</div>
              </div>
            </div>
          </div>

          <MinimalList
            title="Top Formulare"
            rows={data.tops.forms.map((f) => ({ name: f.name, count: f.count }))}
            empty="Keine Leads im Zeitraum."
          />

          <MinimalList
            title="Top Events"
            rows={data.tops.events.map((e) => ({ name: e.name, count: e.count }))}
            empty="Keine Event-Zuordnung vorhanden oder keine Daten."
          />
        </div>
      </div>
    </div>
  );
}
