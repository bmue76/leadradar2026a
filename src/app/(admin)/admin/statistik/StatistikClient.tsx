"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Segmented from "./_components/Segmented";
import LineChart from "./_components/LineChart";

type RangeKey = "today" | "yesterday" | "event" | "custom";

type EventsResp = {
  ok: true;
  data: {
    events: Array<{
      id: string;
      name: string;
      status: "ACTIVE" | "ARCHIVED" | "DRAFT";
      startsAt: string | null;
      endsAt: string | null;
    }>;
    generatedAt: string;
  };
  traceId: string;
};

type StatsOk = {
  ok: true;
  data: {
    generatedAt: string;
    event: { id: string; name: string; status: "ACTIVE" | "ARCHIVED" | "DRAFT" };
    range: { from: string; to: string; compareLabel: string };
    headline: {
      leadsTotal: number;
      deltaPct: number | null;
      qualifiedPct: number;
      devicesActiveCount: number;
      peakHourLabel: string;
      liveAllowed: boolean;
    };
    traffic: { byHour: Array<{ hourStart: string; leads: number; leadsCompare?: number }> };
    devices: { ranking: Array<{ deviceId: string; label: string; leadsTotal: number; leadsPerHourAvg?: number }> };
    insights: {
      topInterests: Array<{ label: string; count: number }>;
      topForms: Array<{ formId: string; name: string; count: number }>;
    };
    quality: {
      cardPct: number;
      notesPct: number;
      qualifiedPct: number;
      funnel: Array<{ label: string; count: number }>;
    };
  };
  traceId: string;
};

type StatsErr = { ok: false; error: { code: string; message: string }; traceId: string };
type StatsResp = StatsOk | StatsErr;

function startOfDayLocal(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function toIso(d: Date) {
  return d.toISOString();
}

function formatDelta(delta: number | null) {
  if (delta == null) return null;
  const sign = delta >= 0 ? "+" : "";
  return `${sign}${delta}%`;
}

function secondsAgo(iso: string, nowIso: string) {
  const a = new Date(iso).getTime();
  const b = new Date(nowIso).getTime();
  return Math.max(0, Math.round((b - a) / 1000));
}

export default function StatistikClient() {
  const router = useRouter();
  const sp = useSearchParams();

  const eventIdParam = sp.get("eventId") ?? "";
  const [events, setEvents] = React.useState<EventsResp["data"]["events"] | null>(null);
  const [eventId, setEventId] = React.useState<string>(eventIdParam);

  const [rangeKey, setRangeKey] = React.useState<RangeKey>((sp.get("range") as RangeKey) || "today");
  const [customFrom, setCustomFrom] = React.useState<string>(sp.get("fromDate") ?? "");
  const [customTo, setCustomTo] = React.useState<string>(sp.get("toDate") ?? "");

  const [live, setLive] = React.useState(false);

  const [stats, setStats] = React.useState<StatsResp | null>(null);
  const [status, setStatus] = React.useState<"idle" | "refreshing" | "ok" | "error" | "paused">("idle");
  const [lastSuccessAt, setLastSuccessAt] = React.useState<string | null>(null);
  const [nowTick, setNowTick] = React.useState<string>(new Date().toISOString());

  const inFlightRef = React.useRef(false);
  const pollMsRef = React.useRef(30_000);
  const timerRef = React.useRef<number | null>(null);

  // Tick for "Aktualisiert vor …"
  React.useEffect(() => {
    const id = window.setInterval(() => setNowTick(new Date().toISOString()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Auto-pause when tab hidden
  React.useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== "visible") {
        setLive(false);
        setStatus("paused");
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Load events once
  React.useEffect(() => {
    let cancelled = false;

    async function loadEvents() {
      const res = await fetch("/api/admin/v1/statistics/events", { cache: "no-store" });
      const json = (await res.json()) as EventsResp;
      if (cancelled) return;

      setEvents(json.data.events);

      // If no eventId in URL: auto-select if exactly 1 ACTIVE event
      if (!eventIdParam) {
        const active = json.data.events.filter((e) => e.status === "ACTIVE");
        if (active.length === 1) {
          const id = active[0].id;
          setEventId(id);
          router.replace(`/admin/statistik?eventId=${encodeURIComponent(id)}&range=${encodeURIComponent(rangeKey)}`);
        }
      }
    }

    loadEvents().catch(() => {
      if (!cancelled) setEvents([]);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep local eventId in sync with URL param
  React.useEffect(() => {
    setEventId(eventIdParam);
  }, [eventIdParam]);

  function resolveRangeDates(selectedEvent: EventsResp["data"]["events"][number] | null): { from: Date; to: Date } | null {
    const now = new Date();

    if (rangeKey === "today") return { from: startOfDayLocal(now), to: now };
    if (rangeKey === "yesterday") {
      const from = startOfDayLocal(new Date(now.getTime() - 24 * 60 * 60 * 1000));
      const to = startOfDayLocal(now);
      return { from, to };
    }
    if (rangeKey === "event") {
      if (!selectedEvent) return null;
      const from = selectedEvent.startsAt ? new Date(selectedEvent.startsAt) : startOfDayLocal(now);
      const to = selectedEvent.endsAt ? new Date(selectedEvent.endsAt) : now;
      return { from, to };
    }

    // custom
    if (!customFrom || !customTo) return null;
    const from = new Date(`${customFrom}T00:00:00`);
    const to = new Date(`${customTo}T23:59:59`);
    return { from, to };
  }

  function clearTimer() {
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }

  async function loadOnce() {
    if (!eventId) return;
    if (inFlightRef.current) return;

    const ev = events?.find((e) => e.id === eventId) ?? null;
    const range = resolveRangeDates(ev);
    if (!range) return;

    inFlightRef.current = true;
    setStatus("refreshing");

    try {
      const qs = new URLSearchParams({
        eventId,
        from: toIso(range.from),
        to: toIso(range.to),
        compare: "previous",
        includeDeleted: "0",
      });

      const res = await fetch(`/api/admin/v1/statistics?${qs.toString()}`, { cache: "no-store" });
      const json = (await res.json()) as StatsResp;

      setStats(json);

      if (json.ok) {
        setLastSuccessAt(json.data.generatedAt);
        pollMsRef.current = 30_000;

        // Archived => read-only, no live
        if (json.data.event.status === "ARCHIVED") {
          setLive(false);
          setStatus("paused");
        } else {
          setStatus(live ? "ok" : "paused");
        }
      } else {
        setStatus("error");
        pollMsRef.current = Math.min(120_000, pollMsRef.current * 2);
      }
    } catch {
      setStatus("error");
      pollMsRef.current = Math.min(120_000, pollMsRef.current * 2);
    } finally {
      inFlightRef.current = false;
    }
  }

  // Initial load whenever selection changes (even if Live is paused)
  React.useEffect(() => {
    if (!eventId) return;
    void loadOnce();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, rangeKey, customFrom, customTo]);

  // Polling loop
  React.useEffect(() => {
    clearTimer();

    if (!live) {
      setStatus((s) => (s === "error" ? "error" : "paused"));
      return;
    }

    let cancelled = false;

    async function tick() {
      if (cancelled) return;

      if (document.visibilityState !== "visible") {
        setLive(false);
        setStatus("paused");
        return;
      }

      await loadOnce();
      if (cancelled) return;

      timerRef.current = window.setTimeout(tick, pollMsRef.current);
    }

    timerRef.current = window.setTimeout(tick, 0);

    return () => {
      cancelled = true;
      clearTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, eventId, rangeKey, customFrom, customTo]);

  const activeCount = (events ?? []).filter((e) => e.status === "ACTIVE").length;
  const noEventSelected = !eventId;

  const statsOk = stats?.ok ? stats : null;
  const liveAllowed = statsOk ? statsOk.data.headline.liveAllowed && statsOk.data.event.status === "ACTIVE" : true;

  const compareLabel =
    rangeKey === "today" ? "vs. gestern" : rangeKey === "yesterday" ? "vs. vorgestern" : "vs. vorheriger Zeitraum";

  const secondaryLine =
    statsOk
      ? [
          statsOk.data.headline.deltaPct != null ? `${formatDelta(statsOk.data.headline.deltaPct)} ${compareLabel}` : null,
          `${statsOk.data.headline.qualifiedPct}% qualifiziert`,
          `${statsOk.data.headline.devicesActiveCount} Geräte aktiv`,
          `Peak: ${statsOk.data.headline.peakHourLabel}`,
        ]
          .filter(Boolean)
          .join(" · ")
      : "—";

  const statusText = (() => {
    if (status === "refreshing") return "Aktualisiere …";
    if (status === "error") return "Live-Update fehlgeschlagen";
    if (!live) return "Pausiert";
    if (statsOk && lastSuccessAt) return `Aktualisiert vor ${secondsAgo(lastSuccessAt, nowTick)}s`;
    return "—";
  })();

  const traceId = stats ? stats.traceId : "";

  const dotStyle: React.CSSProperties = (() => {
    if (status === "error") return { backgroundColor: "#fb7185" }; // soft red
    if (live && liveAllowed) return { backgroundColor: "var(--tenant-accent)" };
    return { backgroundColor: "#cbd5e1" }; // slate-300
  })();

  return (
    <div className="space-y-6">
      {/* Executive Header */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="text-sm text-slate-600">Event</div>

            {events && events.length > 0 ? (
              <div className="mt-1 flex flex-wrap items-center gap-3">
                <select
                  className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                  value={eventId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setEventId(id);
                    router.replace(`/admin/statistik?eventId=${encodeURIComponent(id)}&range=${encodeURIComponent(rangeKey)}`);
                  }}
                >
                  <option value="">Event auswählen…</option>
                  {(events ?? []).map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} {e.status === "ARCHIVED" ? "(Archiv)" : ""}
                    </option>
                  ))}
                </select>

                <Segmented
                  value={rangeKey}
                  items={[
                    { key: "today", label: "Heute" },
                    { key: "yesterday", label: "Gestern" },
                    { key: "event", label: "Gesamte Messe" },
                    { key: "custom", label: "Custom" },
                  ]}
                  onChange={(k) => {
                    setRangeKey(k);
                    const next = new URLSearchParams(sp.toString());
                    next.set("range", k);
                    router.replace(`/admin/statistik?${next.toString()}`);
                  }}
                />
              </div>
            ) : (
              <div className="mt-2 text-sm text-slate-700">Lade Events…</div>
            )}

            {rangeKey === "custom" ? (
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                <div className="text-slate-600">Zeitraum</div>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="h-10 rounded-xl border border-slate-200 bg-white px-3 shadow-sm"
                />
                <span className="text-slate-400">–</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="h-10 rounded-xl border border-slate-200 bg-white px-3 shadow-sm"
                />
              </div>
            ) : null}

            {/* Status line */}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <div className={["text-sm", status === "error" ? "text-rose-600" : "text-slate-600"].join(" ")}>
                {statusText}
              </div>

              {status === "error" ? (
                <button
                  type="button"
                  onClick={() => void loadOnce()}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm hover:bg-slate-50"
                >
                  Erneut versuchen
                </button>
              ) : null}
            </div>

            {traceId ? <div className="mt-1 text-xs text-slate-400">TraceId: {traceId}</div> : null}
          </div>

          <div className="flex w-full flex-col gap-3 md:w-auto md:items-end">
            {/* Live Toggle */}
            <div className="flex items-center gap-3">
              <div
                style={dotStyle}
                className={[
                  "h-2.5 w-2.5 rounded-full",
                  live && liveAllowed ? "animate-[pulse_1s_ease-in-out_infinite]" : "",
                ].join(" ")}
                aria-hidden
              />
              <button
                type="button"
                onClick={() => {
                  if (!liveAllowed) return;
                  setLive((v) => !v);
                }}
                disabled={!liveAllowed}
                className={[
                  "h-10 rounded-xl px-4 text-sm font-medium shadow-sm transition",
                  live && liveAllowed
                    ? "bg-slate-900 text-white hover:bg-slate-800"
                    : !liveAllowed
                      ? "cursor-not-allowed bg-slate-100 text-slate-400"
                      : "border border-slate-200 bg-white text-slate-900 hover:bg-slate-50",
                ].join(" ")}
              >
                {live && liveAllowed ? "Live" : "Pausiert"}
              </button>
            </div>

            {/* Dominant number */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-right">
              <div className="text-4xl font-semibold tracking-tight text-slate-900">
                {statsOk ? statsOk.data.headline.leadsTotal : 0} Leads
              </div>
              <div className="mt-1 text-sm text-slate-600">{secondaryLine}</div>
            </div>

            {/* Primary Action (MVP) */}
            {eventId ? (
              <a
                href={`/admin/leads?eventId=${encodeURIComponent(eventId)}`}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-white px-4 text-sm font-medium text-slate-900 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
              >
                Leads öffnen
              </a>
            ) : null}
          </div>
        </div>

        {/* State A: no active events */}
        {noEventSelected && events && activeCount === 0 ? (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
            <div className="text-sm font-medium text-slate-900">Kein aktives Event.</div>
            <div className="mt-1 text-sm text-slate-600">Wähle ein Event oder erstelle ein neues.</div>
            <div className="mt-3">
              <a
                href="/admin/events"
                className="inline-flex h-10 items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800"
              >
                Event auswählen
              </a>
            </div>
          </div>
        ) : null}
      </section>

      {/* Content */}
      {statsOk ? (
        <>
          <LineChart data={statsOk.data.traffic.byHour} />

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Devices */}
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-3 text-sm font-medium text-slate-900">Geräte-Performance</div>
              {statsOk.data.devices.ranking.length === 0 ? (
                <div className="text-sm text-slate-600">Noch keine Gerätedaten im gewählten Zeitraum.</div>
              ) : (
                <ol className="space-y-2">
                  {statsOk.data.devices.ranking.map((d) => (
                    <li key={d.deviceId} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-slate-900">{d.label}</div>
                        {typeof d.leadsPerHourAvg === "number" ? (
                          <div className="text-xs text-slate-500">{d.leadsPerHourAvg} Leads / Std.</div>
                        ) : null}
                      </div>
                      <div className="text-sm font-semibold text-slate-900">{d.leadsTotal}</div>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            {/* Lead Quality */}
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-3 text-sm font-medium text-slate-900">Lead-Qualität</div>

              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-slate-50 px-4 py-3">
                  <div className="text-xs text-slate-600">Mit Visitenkarte</div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">{statsOk.data.quality.cardPct}%</div>
                </div>
                <div className="rounded-xl bg-slate-50 px-4 py-3">
                  <div className="text-xs text-slate-600">Mit Notizen</div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">{statsOk.data.quality.notesPct}%</div>
                </div>
                <div className="rounded-xl bg-slate-50 px-4 py-3">
                  <div className="text-xs text-slate-600">Qualifiziert</div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">{statsOk.data.quality.qualifiedPct}%</div>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {statsOk.data.quality.funnel.map((f) => (
                  <div key={f.label} className="flex items-center justify-between text-sm">
                    <div className="text-slate-600">{f.label}</div>
                    <div className="font-medium text-slate-900">{f.count}</div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Interests / Forms */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-3 text-sm font-medium text-slate-900">Top Interessen</div>

            {statsOk.data.insights.topInterests.length === 0 ? (
              <div className="text-sm text-slate-600">Noch keine auswertbaren Auswahlfelder im gewählten Zeitraum.</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {statsOk.data.insights.topInterests.map((x) => (
                  <div key={x.label} className="rounded-full bg-slate-50 px-3 py-1 text-sm text-slate-800">
                    <span className="font-medium">{x.label}</span>
                    <span className="ml-2 text-slate-500">{x.count}</span>
                  </div>
                ))}
              </div>
            )}

            {statsOk.data.insights.topForms.length > 0 ? (
              <div className="mt-5">
                <div className="mb-2 text-sm font-medium text-slate-900">Top Formulare</div>
                <ul className="space-y-2">
                  {statsOk.data.insights.topForms.map((f) => (
                    <li key={f.formId} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                      <div className="text-sm text-slate-900">{f.name}</div>
                      <div className="text-sm font-semibold text-slate-900">{f.count}</div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        </>
      ) : stats && !stats.ok ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-sm font-medium text-slate-900">Fehler</div>
          <div className="mt-1 text-sm text-slate-600">{stats.error.message}</div>
          <div className="mt-3">
            <button
              type="button"
              onClick={() => void loadOnce()}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 shadow-sm hover:bg-slate-50"
            >
              Erneut versuchen
            </button>
          </div>
          <div className="mt-2 text-xs text-slate-400">TraceId: {stats.traceId}</div>
        </section>
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-sm text-slate-600">Wähle ein Event, um die Statistik zu sehen.</div>
        </section>
      )}
    </div>
  );
}
