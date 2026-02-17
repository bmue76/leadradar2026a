"use client";

import * as React from "react";
import Link from "next/link";
import { adminFetchJson } from "../_lib/adminFetch";

type EventListItem = {
  id: string;
  name: string;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  boundDevicesCount?: number;
  createdAt?: string;
};

type ApiResult<T> =
  | { ok: true; data: T; traceId?: string }
  | { ok: false; code: string; message: string; traceId?: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function pickArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return [];
  if (Array.isArray(payload.items)) return payload.items as unknown[];
  if (Array.isArray(payload.events)) return payload.events as unknown[];
  if (isRecord(payload.data)) {
    const d = payload.data as Record<string, unknown>;
    if (Array.isArray(d.items)) return d.items as unknown[];
    if (Array.isArray(d.events)) return d.events as unknown[];
  }
  return [];
}

function fmtDt(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("de-CH", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function statusLabel(s: string): string {
  const v = (s || "").toUpperCase();
  if (v === "ACTIVE") return "Aktiv";
  if (v === "DRAFT") return "Entwurf";
  if (v === "ARCHIVED") return "Archiviert";
  return v || "—";
}

function chip(status: string): string {
  const s = (status || "").toUpperCase();
  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border";
  if (s === "ACTIVE") return `${base} bg-emerald-50 text-emerald-900 border-emerald-200`;
  if (s === "DRAFT") return `${base} bg-slate-50 text-slate-800 border-slate-200`;
  if (s === "ARCHIVED") return `${base} bg-slate-100 text-slate-700 border-slate-200`;
  return `${base} bg-slate-100 text-slate-700 border-slate-200`;
}

function fmtApiErr(res: ApiResult<unknown>): string {
  if (res.ok) return "";
  return `${res.code}: ${res.message}${res.traceId ? ` · Support-Code: ${res.traceId}` : ""}`;
}

function btnBase() {
  return "rounded-xl px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:opacity-50";
}

export default function EventsClient() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const [items, setItems] = React.useState<EventListItem[]>([]);
  const [filterStatus, setFilterStatus] = React.useState<string>("ALL");
  const [busyEventId, setBusyEventId] = React.useState<string | null>(null);

  function pushNotice(msg: string) {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 2500);
  }

  async function load() {
    setLoading(true);
    setError(null);

    const qs = new URLSearchParams();
    qs.set("limit", "200");
    qs.set("includeCounts", "true");
    if (filterStatus !== "ALL") qs.set("status", filterStatus);

    const res = (await adminFetchJson<unknown>(`/api/admin/v1/events?${qs.toString()}`, {
      method: "GET",
    })) as ApiResult<unknown>;

    if (!res.ok) {
      setItems([]);
      setError(fmtApiErr(res));
      setLoading(false);
      return;
    }

    const arr = pickArray(res.data);
    const parsed: EventListItem[] = arr
      .map((x) => {
        if (!isRecord(x)) return null;

        const id = typeof x.id === "string" ? x.id : "";
        const name = typeof x.name === "string" ? x.name : "";
        const st = typeof x.status === "string" ? x.status : "—";
        if (!id || !name) return null;

        const startsAt = typeof x.startsAt === "string" ? x.startsAt : x.startsAt === null ? null : null;
        const endsAt = typeof x.endsAt === "string" ? x.endsAt : x.endsAt === null ? null : null;

        const createdAt = typeof x.createdAt === "string" ? x.createdAt : undefined;
        const boundDevicesCount = typeof x.boundDevicesCount === "number" ? x.boundDevicesCount : undefined;

        return { id, name, status: st, startsAt, endsAt, boundDevicesCount, createdAt };
      })
      .filter(Boolean) as EventListItem[];

    setItems(parsed);
    setLoading(false);
  }

  async function setEventStatus(eventId: string, status: "ACTIVE" | "ARCHIVED" | "DRAFT") {
    setError(null);
    setBusyEventId(eventId);

    const res = (await adminFetchJson<unknown>(`/api/admin/v1/events/${eventId}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    })) as ApiResult<unknown>;

    if (!res.ok) {
      setBusyEventId(null);
      setError(fmtApiErr(res));
      return;
    }

    let msg = `Status gesetzt: ${statusLabel(status)}`;

    if (isRecord(res.data)) {
      const autoArchivedEventId = typeof res.data.autoArchivedEventId === "string" ? res.data.autoArchivedEventId : null;
      const devicesUnboundCount = typeof res.data.devicesUnboundCount === "number" ? res.data.devicesUnboundCount : null;

      if (status === "ACTIVE" && autoArchivedEventId) {
        msg = `Event aktiviert · vorheriges ACTIVE archiviert · Devices gelöst: ${devicesUnboundCount ?? 0}`;
      } else if (status !== "ACTIVE" && devicesUnboundCount !== null) {
        msg = `Event ${statusLabel(status)} · Devices gelöst: ${devicesUnboundCount ?? 0}`;
      }
    }

    pushNotice(msg);
    setBusyEventId(null);
    await load();
  }

  async function unbindDevices(eventId: string) {
    const ok = window.confirm("Devices lösen (activeEventId=null) für dieses Event?");
    if (!ok) return;

    setError(null);
    setBusyEventId(eventId);

    const res = (await adminFetchJson<unknown>(`/api/admin/v1/events/${eventId}/unbind-devices`, {
      method: "POST",
    })) as ApiResult<unknown>;

    if (!res.ok) {
      setBusyEventId(null);
      setError(fmtApiErr(res));
      return;
    }

    let count = 0;
    if (isRecord(res.data) && typeof res.data.unboundDevicesCount === "number") {
      count = res.data.unboundDevicesCount;
    }

    pushNotice(`Devices gelöst: ${count}`);
    setBusyEventId(null);
    await load();
  }

  async function deleteEvent(eventId: string, name: string) {
    const ok = window.confirm(
      `Event löschen?\n\n"${name}"\n\nNur möglich, wenn das Event nie genutzt wurde (keine Leads / keine referenzierenden Formulare / keine gebundenen Geräte).`
    );
    if (!ok) return;

    setError(null);
    setBusyEventId(eventId);

    const res = (await adminFetchJson<unknown>(`/api/admin/v1/events/${eventId}`, {
      method: "DELETE",
    })) as ApiResult<unknown>;

    if (!res.ok) {
      setBusyEventId(null);
      setError(fmtApiErr(res));
      return;
    }

    pushNotice("Event gelöscht.");
    setBusyEventId(null);
    await load();
  }

  React.useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus]);

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Events</h1>
          <p className="mt-1 text-sm text-slate-600">
            Übersicht deiner Messen/Events. Status steuert, was in der Praxis aktiv genutzt wird. Löschen ist nur erlaubt, wenn ein Event nie genutzt wurde.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            disabled={loading}
            aria-label="Statusfilter"
          >
            <option value="ALL">Alle</option>
            <option value="ACTIVE">Aktiv</option>
            <option value="DRAFT">Entwurf</option>
            <option value="ARCHIVED">Archiviert</option>
          </select>

          <button
            type="button"
            onClick={() => void load()}
            className={`${btnBase()} border border-slate-200 bg-white text-slate-900 hover:bg-slate-50`}
          >
            Aktualisieren
          </button>

          <Link
            href="/admin/settings/mobile"
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-200"
          >
            Mobile Ops
          </Link>
        </div>
      </div>

      {notice ? (
        <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {notice}
        </div>
      ) : null}

      {error ? (
        <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Start</th>
              <th className="px-4 py-3">Ende</th>
              <th className="px-4 py-3">Devices</th>
              <th className="px-4 py-3 text-right">Aktionen</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-4 text-slate-600" colSpan={6}>
                  Lade…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-slate-600" colSpan={6}>
                  Keine Events gefunden.
                </td>
              </tr>
            ) : (
              items.map((ev) => {
                const st = (ev.status || "").toUpperCase();
                const isBusy = busyEventId === ev.id;
                const devicesLabel = typeof ev.boundDevicesCount === "number" ? String(ev.boundDevicesCount) : "—";
                const canOfferDelete = st !== "ACTIVE";

                return (
                  <tr key={ev.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 text-slate-900">{ev.name}</td>

                    <td className="px-4 py-3">
                      <span className={chip(ev.status)}>{statusLabel(ev.status)}</span>
                    </td>

                    <td className="px-4 py-3 text-slate-700">{fmtDt(ev.startsAt)}</td>
                    <td className="px-4 py-3 text-slate-700">{fmtDt(ev.endsAt)}</td>

                    <td className="px-4 py-3 text-slate-800">{devicesLabel}</td>

                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex flex-wrap items-center justify-end gap-2">
                        {st !== "ACTIVE" ? (
                          <button
                            type="button"
                            onClick={() => void setEventStatus(ev.id, "ACTIVE")}
                            disabled={isBusy}
                            className={`${btnBase()} border border-slate-200 bg-white text-slate-900 hover:bg-slate-50`}
                            title="Setzt dieses Event aktiv."
                          >
                            Aktivieren
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void setEventStatus(ev.id, "ARCHIVED")}
                            disabled={isBusy}
                            className={`${btnBase()} border border-slate-200 bg-white text-slate-900 hover:bg-slate-50`}
                            title="Archiviert dieses Event und löst Devices (falls implementiert)."
                          >
                            Archivieren
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => void unbindDevices(ev.id)}
                          disabled={isBusy}
                          className={`${btnBase()} border border-rose-200 bg-rose-50 text-rose-900 hover:bg-rose-100`}
                          title="Danger Zone: setzt activeEventId=null für alle Devices, die auf dieses Event zeigen."
                        >
                          Devices lösen
                        </button>

                        {canOfferDelete ? (
                          <button
                            type="button"
                            onClick={() => void deleteEvent(ev.id, ev.name)}
                            disabled={isBusy}
                            className={`${btnBase()} border border-rose-200 bg-white text-rose-700 hover:bg-rose-50`}
                            title="Löscht das Event (nur wenn nie genutzt: keine Leads / keine referenzierenden Formulare / keine gebundenen Geräte)."
                          >
                            Löschen
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 text-xs text-slate-600">
        Hinweis: Lead-Zuordnung läuft über <span className="font-mono">mobileDevice.activeEventId</span>. Das setzt du in{" "}
        <Link href="/admin/settings/mobile" className="underline underline-offset-4">
          Mobile Ops
        </Link>
        .
      </div>
    </div>
  );
}
