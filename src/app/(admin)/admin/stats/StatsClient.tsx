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

function Card(props: { title: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <div className="text-xs font-medium text-muted-foreground">{props.title}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{props.value}</div>
      {props.hint ? <div className="mt-1 text-xs text-muted-foreground">{props.hint}</div> : null}
    </div>
  );
}

function Section(props: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">{props.title}</h2>
        {props.right}
      </div>
      <div className="rounded-xl border bg-card">{props.children}</div>
    </section>
  );
}

function Segmented<T extends string>(props: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border bg-background p-1">
      {props.options.map((o) => {
        const active = o.value === props.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => props.onChange(o.value)}
            className={[
              "rounded-md px-3 py-1.5 text-sm transition",
              active ? "bg-foreground text-background" : "text-foreground hover:bg-muted",
            ].join(" ")}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function MiniBars(props: { items: Array<{ label: string; value: number }>; ariaLabel: string }) {
  const max = Math.max(1, ...props.items.map((i) => i.value));
  return (
    <div className="p-4">
      <div className="sr-only">{props.ariaLabel}</div>
      <div className="flex items-end gap-1">
        {props.items.map((i) => {
          const h = Math.round((i.value / max) * 100);
          return (
            <div key={i.label} className="flex w-full flex-col items-center gap-2">
              <div className="w-full rounded-sm bg-muted" style={{ height: 88 }}>
                <div
                  className="w-full rounded-sm bg-foreground"
                  style={{ height: `${h}%`, marginTop: `${100 - h}%` }}
                />
              </div>
              <div className="text-[11px] tabular-nums text-muted-foreground">{i.label.slice(5)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FinderTable(props: { rows: Array<{ name: string; count: number }>; empty: string }) {
  if (!props.rows.length) {
    return <div className="p-4 text-sm text-muted-foreground">{props.empty}</div>;
  }
  return (
    <div className="overflow-hidden">
      <div className="grid grid-cols-[1fr_auto] gap-3 border-b px-4 py-2 text-xs font-medium text-muted-foreground">
        <div>Name</div>
        <div className="text-right">Leads</div>
      </div>
      <div className="divide-y">
        {props.rows.map((r) => (
          <div key={r.name} className="grid grid-cols-[1fr_auto] gap-3 px-4 py-2 text-sm">
            <div className="truncate">{r.name}</div>
            <div className="text-right tabular-nums">{formatInt(r.count)}</div>
          </div>
        ))}
      </div>
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

  const kpiCards = useMemo(() => {
    if (!data) return [];
    const k = data.kpis;

    const cards: Array<{ title: string; value: string; hint?: string }> = [
      { title: "Leads gesamt", value: formatInt(k.leadsTotal), hint: `Zeitraum ${data.range}` },
      { title: "Leads heute", value: formatInt(k.leadsToday), hint: `TZ ${data.timezone}` },
      { title: "Leads diese Woche", value: formatInt(k.leadsWeek), hint: "letzte 7 Tage" },
    ];

    if (data.activeEvent && typeof k.leadsActiveEvent === "number") {
      cards.push({ title: "Leads dieses Event", value: formatInt(k.leadsActiveEvent), hint: data.activeEvent.name });
    } else {
      cards.push({
        title: "Leads dieses Event",
        value: "—",
        hint: scope === "ACTIVE" ? "Kein aktives Event" : "Scope = ALL",
      });
    }

    if (typeof k.ocrRate === "number") {
      cards.push({
        title: "OCR Quote",
        value: formatPct(k.ocrRate),
        hint: typeof k.ocrCount === "number" ? `${formatInt(k.ocrCount)} OCR Leads` : "",
      });
    } else {
      cards.push({ title: "OCR Quote", value: "—", hint: "Optional (wenn Daten vorhanden)" });
    }

    return cards;
  }, [data, scope]);

  const dailyForChart = useMemo(() => {
    if (!data) return [];
    const arr = data.series.leadsByDay;
    const wanted = data.range === "7d" || data.range === "14d" ? arr : arr.slice(Math.max(0, arr.length - 14));
    return wanted.map((x) => ({ label: x.day, value: x.count }));
  }, [data]);

  const statusRows = useMemo(() => {
    if (!data) return [];
    const m = new Map<Status, number>(data.series.leadsByStatus.map((s) => [s.status, s.count]));
    return [
      { name: "NEW", count: m.get("NEW") ?? 0 },
      { name: "REVIEWED", count: m.get("REVIEWED") ?? 0 },
    ];
  }, [data]);

  return (
    <div className="mt-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="text-xs text-muted-foreground">
          {data ? (
            <>
              Scope: <span className="font-medium text-foreground">{scope === "ACTIVE" ? "Aktives Event" : "Alle Events"}</span>
              {data.activeEvent && scope === "ACTIVE" ? (
                <>
                  {" "}
                  · aktiv: <span className="font-medium text-foreground">{data.activeEvent.name}</span>
                </>
              ) : null}
            </>
          ) : (
            " "
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            value={scope}
            options={[
              { value: "ACTIVE", label: "Aktives Event" },
              { value: "ALL", label: "Alle Events" },
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
            className="rounded-md border bg-background px-3 py-1.5 text-sm text-foreground hover:bg-muted"
          >
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="mt-4 grid gap-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 rounded-xl border bg-card" />
            ))}
          </div>
          <div className="h-56 rounded-xl border bg-card" />
          <div className="h-56 rounded-xl border bg-card" />
        </div>
      ) : err ? (
        <div className="mt-4 rounded-xl border bg-card p-4">
          <div className="text-sm font-semibold">Fehler</div>
          <div className="mt-1 text-sm text-muted-foreground">{err.message}</div>
          {err.traceId ? (
            <div className="mt-2 text-xs text-muted-foreground">
              TraceId: <span className="font-mono">{err.traceId}</span>
            </div>
          ) : null}
          <div className="mt-3">
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                setRefreshKey((k) => k + 1);
              }}
              className="rounded-md bg-foreground px-3 py-2 text-sm text-background"
            >
              Erneut versuchen
            </button>
          </div>
        </div>
      ) : data ? (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {kpiCards.map((c) => (
              <Card key={c.title} title={c.title} value={c.value} hint={c.hint} />
            ))}
          </div>

          <Section title="Leads over time" right={<div className="text-xs text-muted-foreground">letzte {dailyForChart.length} Tage</div>}>
            <MiniBars items={dailyForChart} ariaLabel="Leads pro Tag" />
          </Section>

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div className="rounded-xl border bg-card">
              <div className="border-b px-4 py-3">
                <div className="text-sm font-semibold">Leads nach Status</div>
                <div className="mt-1 text-xs text-muted-foreground">NEW vs REVIEWED (Zeitraum)</div>
              </div>
              <FinderTable rows={statusRows.map((r) => ({ name: r.name, count: r.count }))} empty="Keine Daten im Zeitraum." />
            </div>

            <div className="rounded-xl border bg-card">
              <div className="border-b px-4 py-3">
                <div className="text-sm font-semibold">Top Formulare</div>
                <div className="mt-1 text-xs text-muted-foreground">Top 5 nach Leads</div>
              </div>
              <FinderTable rows={data.tops.forms.map((f) => ({ name: f.name, count: f.count }))} empty="Keine Leads im Zeitraum." />
            </div>
          </div>

          <div className="mt-6 rounded-xl border bg-card">
            <div className="border-b px-4 py-3">
              <div className="text-sm font-semibold">Top Events</div>
              <div className="mt-1 text-xs text-muted-foreground">Top 5 nach Leads (Zeitraum)</div>
            </div>
            <FinderTable rows={data.tops.events.map((e) => ({ name: e.name, count: e.count }))} empty="Keine Event-Zuordnung vorhanden oder keine Daten." />
          </div>
        </>
      ) : (
        <div className="mt-4 rounded-xl border bg-card p-4 text-sm text-muted-foreground">Keine Daten.</div>
      )}
    </div>
  );
}
