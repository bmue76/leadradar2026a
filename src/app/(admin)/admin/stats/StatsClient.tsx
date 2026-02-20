"use client";

import { useEffect, useMemo, useState } from "react";

type Status = "NEW" | "REVIEWED";

type StatsOverview = {
  range: "7d" | "14d" | "30d" | "90d";
  timezone: string;
  events: Array<{ id: string; name: string; status: string }>;
  activeEvent: { id: string; name: string } | null;
  selectedEventId: string | null;
  kpis: {
    leadsTotal: number;
    leadsToday: number;
    leadsWeek: number;
    reviewedCount: number;
    newCount: number;
    ocrCount?: number;
    ocrRate?: number;
  };
  series: {
    leadsByDay: Array<{ day: string; count: number }>;
    leadsByHourToday: Array<{ hour: number; count: number }>;
    leadsByHourRange: Array<{ hour: number; count: number; avgPerDay: number }>;
    leadsByStatus: Array<{ status: Status; count: number }>;
  };
  tops: {
    forms: Array<{ id: string; name: string; count: number }>;
    interests: Array<{ label: string; count: number }>;
    devicesToday: Array<{ label: string; count: number }>;
    devicesTotal: Array<{ label: string; count: number }>;
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

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function Metric(props: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className="py-1">
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

function TinyBarList(props: { rows: Array<{ label: string; count: number }>; empty: string }) {
  if (!props.rows.length) {
    return <div className="mt-3 text-sm text-muted-foreground">{props.empty}</div>;
  }
  const max = Math.max(1, ...props.rows.map((r) => r.count));
  return (
    <div className="mt-3 space-y-2">
      {props.rows.map((r) => {
        const w = Math.round((r.count / max) * 100);
        return (
          <div key={r.label} className="group flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/30">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm">{r.label}</div>
              <div className="mt-1 h-1.5 w-full rounded-full bg-muted/40">
                <div className="h-1.5 rounded-full bg-primary" style={{ width: `${clamp(w, 2, 100)}%` }} />
              </div>
            </div>
            <div className="tabular-nums text-sm text-muted-foreground">{formatInt(r.count)}</div>
          </div>
        );
      })}
    </div>
  );
}

function TrafficChart(props: {
  today: Array<{ hour: number; count: number }>;
  rangeAvg: Array<{ hour: number; avgPerDay: number; count: number }>;
  tz: string;
}) {
  // Apple-clean: 24 columns, background shows range avg/day, foreground shows today (accent).
  const maxBg = Math.max(1, ...props.rangeAvg.map((h) => h.avgPerDay));
  const maxFg = Math.max(1, ...props.today.map((h) => h.count));
  const max = Math.max(maxBg, maxFg);

  return (
    <div className="mt-4">
      <div className="flex items-end gap-1">
        {props.rangeAvg.map((h) => {
          const t = props.today[h.hour]?.count ?? 0;
          const bgH = Math.round((h.avgPerDay / max) * 44);
          const fgH = Math.round((t / max) * 44);

          return (
            <div key={h.hour} className="flex flex-col items-center gap-1">
              <div
                className="w-[8px] rounded-full bg-muted/50"
                style={{ height: `${clamp(bgH, 3, 44)}px` }}
                title={`${String(h.hour).padStart(2, "0")}:00 · Ø/Tag ${h.avgPerDay.toFixed(1)} · Range total ${h.count}`}
              >
                <div
                  className="w-[8px] rounded-full bg-primary"
                  style={{ height: `${clamp(fgH, 0, 44)}px`, marginTop: `${clamp(bgH - fgH, 0, 44)}px` }}
                  title={`${String(h.hour).padStart(2, "0")}:00 · Heute ${t} · Ø/Tag ${h.avgPerDay.toFixed(1)}`}
                />
              </div>
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

      <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
        <div>Leads pro Stunde (Heute + Ø/Tag im Zeitraum)</div>
        <div>TZ {props.tz}</div>
      </div>

      <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-primary" />
          Heute
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-muted/60" />
          Ø/Tag (Range)
        </span>
      </div>
    </div>
  );
}

export default function StatsClient() {
  const [range, setRange] = useState<StatsOverview["range"]>("30d");
  const [eventSel, setEventSel] = useState<string>("ACTIVE"); // "ACTIVE" | "<eventId>"
  const [refreshKey, setRefreshKey] = useState<number>(0);

  const [data, setData] = useState<StatsOverview | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [err, setErr] = useState<{ message: string; traceId?: string } | null>(null);

  useEffect(() => {
    let cancelled = false;

    const url = `/api/admin/v1/stats/overview?range=${encodeURIComponent(range)}&event=${encodeURIComponent(
      eventSel
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
  }, [range, eventSel, refreshKey]);

  const derived = useMemo(() => {
    if (!data) return null;

    const hourToday = data.series.leadsByHourToday;
    const hourRange = data.series.leadsByHourRange;

    const peak = hourToday.reduce<{ hour: number | null; count: number }>(
      (acc, h) => (h.count > acc.count ? { hour: h.hour, count: h.count } : acc),
      { hour: null, count: 0 }
    );

    const forms = data.tops.forms.map((f) => ({ label: f.name, count: f.count }));
    const interests = data.tops.interests.map((x) => ({ label: x.label, count: x.count }));
    const devToday = data.tops.devicesToday.map((x) => ({ label: x.label, count: x.count }));
    const devTotal = data.tops.devicesTotal.map((x) => ({ label: x.label, count: x.count }));

    const reviewRate = data.kpis.leadsTotal > 0 ? data.kpis.reviewedCount / data.kpis.leadsTotal : 0;

    return {
      peakHour: peak.hour,
      peakCount: peak.count,
      reviewRate,
      forms,
      interests,
      devToday,
      devTotal,
      hourToday,
      hourRange,
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
      {/* Controls: Event dropdown + Range pills + Refresh */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="text-[11px] text-muted-foreground">
          {data.activeEvent ? (
            <>
              Event: <span className="font-medium text-foreground">{data.activeEvent.name}</span>
            </>
          ) : (
            <>Event: <span className="font-medium text-foreground">—</span></>
          )}
          <span className="mx-2">·</span>
          TZ <span className="font-medium text-foreground">{data.timezone}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-full bg-muted/40 px-3 py-2">
            <select
              value={eventSel}
              onChange={(e) => {
                setLoading(true);
                setEventSel(e.target.value);
              }}
              className="bg-transparent text-sm outline-none"
              aria-label="Event auswählen"
            >
              <option value="ACTIVE">Aktives Event</option>
              {data.events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name}
                </option>
              ))}
            </select>
          </div>

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
              setRefreshKey((x) => x + 1);
            }}
            className="rounded-full px-3 py-2 text-sm text-foreground hover:bg-muted/40"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Hero KPI row */}
      <div className="mt-10 grid gap-10 md:grid-cols-[1.2fr_0.8fr]">
        <div>
          <div className="text-[11px] font-medium tracking-wide text-muted-foreground">
            Total (Zeitraum {data.range})
          </div>
          <div className="mt-2 flex items-end gap-3">
            <div className="text-5xl font-semibold tracking-tight tabular-nums">{formatInt(k.leadsTotal)}</div>
            <div className="pb-1 text-sm text-muted-foreground">
              Review <span className="text-primary font-medium">{formatPct(derived.reviewRate)}</span>
            </div>
          </div>

          {/* KPI strip */}
          <div className="mt-8 grid grid-cols-2 gap-x-10 gap-y-6 md:grid-cols-4">
            <Metric label="Leads heute" value={formatInt(k.leadsToday)} accent />
            <Metric label="Diese Woche" value={formatInt(k.leadsWeek)} />
            <Metric label="Top Formulare" value={formatInt(derived.forms.reduce((a, x) => a + x.count, 0))} hint="Top 5 im Zeitraum" />
            <Metric
              label="OCR"
              value={typeof k.ocrRate === "number" ? formatPct(k.ocrRate) : "—"}
              hint={typeof k.ocrCount === "number" ? `${formatInt(k.ocrCount)} OCR Leads` : "Optional"}
            />
          </div>

          {/* Traffic chart (must-have) */}
          <div className="mt-10">
            <div className="text-sm font-semibold">Traffic</div>
            <TrafficChart today={derived.hourToday} rangeAvg={derived.hourRange} tz={data.timezone} />
            <div className="mt-3 text-[11px] text-muted-foreground">
              Peak:{" "}
              <span className="font-medium text-primary">
                {derived.peakHour === null ? "—" : `${String(derived.peakHour).padStart(2, "0")}:00`}
              </span>{" "}
              · {formatInt(derived.peakCount)} Leads
            </div>
          </div>
        </div>

        {/* Right column: rankings */}
        <div>
          <div className="text-sm font-semibold">Leads pro Formular</div>
          <TinyBarList rows={derived.forms} empty="Keine Leads im Zeitraum." />

          <div className="mt-10 text-sm font-semibold">Top Interessen (Top-Antworten)</div>
          <TinyBarList rows={derived.interests} empty="Keine passenden Antworten gefunden (Interesse/Thema/Topic…)." />

          <div className="mt-10 grid gap-8 md:grid-cols-2">
            <div>
              <div className="text-sm font-semibold">Leads pro Gerät</div>
              <div className="mt-1 text-[11px] text-muted-foreground">Heute</div>
              <TinyBarList rows={derived.devToday} empty="Heute noch keine Leads." />
            </div>
            <div>
              <div className="text-sm font-semibold">&nbsp;</div>
              <div className="mt-1 text-[11px] text-muted-foreground">Total (Zeitraum)</div>
              <TinyBarList rows={derived.devTotal} empty="Keine Geräte-Infos in meta." />
            </div>
          </div>

          {/* Status mini */}
          <div className="mt-10">
            <div className="text-sm font-semibold">Status</div>
            <div className="mt-3 grid gap-2">
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
        </div>
      </div>
    </div>
  );
}
