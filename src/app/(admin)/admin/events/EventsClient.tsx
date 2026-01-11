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
  createdAt?: string;
};

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

function isoShort(d?: string | null): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toISOString().replace("T", " ").slice(0, 16) + "Z";
}

function chip(status: string): string {
  const s = (status || "").toUpperCase();
  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border";
  if (s === "ACTIVE") return `${base} bg-emerald-50 text-emerald-900 border-emerald-200`;
  if (s === "DRAFT") return `${base} bg-neutral-50 text-neutral-800 border-neutral-200`;
  if (s === "ARCHIVED") return `${base} bg-neutral-100 text-neutral-700 border-neutral-200`;
  return `${base} bg-neutral-100 text-neutral-700 border-neutral-200`;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function EventsClient() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [items, setItems] = React.useState<EventListItem[]>([]);
  const [status, setStatus] = React.useState<string>("ALL");
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);

    const qs = new URLSearchParams();
    qs.set("limit", "200");
    if (status !== "ALL") qs.set("status", status);

    const res = await adminFetchJson<unknown>(`/api/admin/v1/events?${qs.toString()}`, { method: "GET" });

    if (!res.ok) {
      setItems([]);
      setError(`${res.code}: ${res.message}${res.traceId ? ` · trace ${res.traceId}` : ""}`);
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

        const startsAt =
          typeof x.startsAt === "string" ? x.startsAt : x.startsAt === null ? null : null;
        const endsAt =
          typeof x.endsAt === "string" ? x.endsAt : x.endsAt === null ? null : null;

        const createdAt =
          typeof x.createdAt === "string" ? x.createdAt : undefined;

        return { id, name, status: st, startsAt, endsAt, createdAt };
      })
      .filter(Boolean) as EventListItem[];

    setItems(parsed);
    setLoading(false);
  }

  React.useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Events</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Übersicht deiner Messen/Events. Wichtig für Mobile: Active Event Binding pro Device (Mobile Ops).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            disabled={loading}
          >
            <option value="ALL">All</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="DRAFT">DRAFT</option>
            <option value="ARCHIVED">ARCHIVED</option>
          </select>

          <button
            type="button"
            onClick={() => void load()}
            className="rounded-xl border border-neutral-200 px-3 py-2 text-sm text-neutral-800 hover:bg-neutral-50"
          >
            Refresh
          </button>

          <Link
            href="/admin/settings/mobile"
            className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Mobile Ops
          </Link>
        </div>
      </div>

      {error ? (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
          <div className="mt-2 text-xs text-red-800/70">
            Teste API direkt: <span className="font-mono">/api/admin/v1/events</span>
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-xs text-neutral-600">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Starts</th>
              <th className="px-4 py-3">Ends</th>
              <th className="px-4 py-3">Event ID</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-4 text-neutral-600" colSpan={6}>
                  Loading…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-neutral-600" colSpan={6}>
                  No events found.
                </td>
              </tr>
            ) : (
              items.map((ev) => (
                <tr key={ev.id} className="border-t border-neutral-100">
                  <td className="px-4 py-3">{ev.name}</td>
                  <td className="px-4 py-3">
                    <span className={chip(ev.status)}>{ev.status}</span>
                  </td>
                  <td className="px-4 py-3">{isoShort(ev.startsAt)}</td>
                  <td className="px-4 py-3">{isoShort(ev.endsAt)}</td>
                  <td className="px-4 py-3 font-mono text-xs">{ev.id}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = await copyToClipboard(ev.id);
                        if (ok) {
                          setCopiedId(ev.id);
                          setTimeout(() => setCopiedId(null), 1200);
                        }
                      }}
                      className="rounded-xl border border-neutral-200 px-3 py-1.5 text-sm text-neutral-800 hover:bg-neutral-50"
                    >
                      {copiedId === ev.id ? "Copied" : "Copy ID"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 text-xs text-neutral-600">
        Hinweis: Lead-Zuordnung läuft über <span className="font-mono">mobileDevice.activeEventId</span>. Das setzt du in{" "}
        <Link href="/admin/settings/mobile" className="underline underline-offset-4">
          Mobile Ops
        </Link>
        .
      </div>
    </div>
  );
}
