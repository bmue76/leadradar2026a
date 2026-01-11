"use client";

import * as React from "react";
import { adminFetchJson } from "../_lib/adminFetch";

type LeadItem = {
  id: string;
  formId: string;
  eventId?: string | null;
  capturedAt: string;
  isDeleted: boolean;
  values: Record<string, unknown>;
};

type FormItem = { id: string; name: string; status: string };
type EventItem = { id: string; name: string; status: string; location?: string | null; startsAt?: string | null };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function fmtErr(e: { code: string; message: string; traceId?: string; status?: number }): string {
  const parts = [`${e.code}: ${e.message}`];
  if (typeof e.status === "number") parts.push(`HTTP ${e.status}`);
  if (e.traceId) parts.push(`trace ${e.traceId}`);
  return parts.join(" · ");
}

function isoShort(d?: string | null): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toISOString().replace("T", " ").slice(0, 16) + "Z";
}

function pickArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return [];
  if (Array.isArray(payload.items)) return payload.items as unknown[];
  if (Array.isArray(payload.forms)) return payload.forms as unknown[];
  if (Array.isArray(payload.events)) return payload.events as unknown[];
  if (isRecord(payload.data)) {
    const d = payload.data as Record<string, unknown>;
    if (Array.isArray(d.items)) return d.items as unknown[];
    if (Array.isArray(d.forms)) return d.forms as unknown[];
    if (Array.isArray(d.events)) return d.events as unknown[];
  }
  return [];
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function chipClasses(kind: "event" | "none" | "archived" | "draft" | "active"): string {
  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border";
  if (kind === "active") return `${base} bg-emerald-50 text-emerald-900 border-emerald-200`;
  if (kind === "draft") return `${base} bg-sky-50 text-sky-900 border-sky-200`;
  if (kind === "archived") return `${base} bg-neutral-100 text-neutral-700 border-neutral-200`;
  if (kind === "none") return `${base} bg-amber-50 text-amber-900 border-amber-200`;
  return `${base} bg-neutral-100 text-neutral-700 border-neutral-200`;
}

function leadPreview(values: Record<string, unknown>): string {
  const keys = ["company", "organization", "firma", "firstName", "lastName", "name", "email", "phone", "mobile"];
  const parts: string[] = [];

  for (const k of keys) {
    const v = values[k];
    if (typeof v === "string" && v.trim()) parts.push(`${k}: ${v.trim()}`);
  }

  if (parts.length > 0) return parts.slice(0, 3).join(" · ");

  // fallback: first 3 entries
  const entries = Object.entries(values)
    .filter(([, v]) => typeof v === "string" && (v as string).trim())
    .slice(0, 3)
    .map(([k, v]) => `${k}: ${(v as string).trim()}`);

  return entries.length ? entries.join(" · ") : "—";
}

export default function LeadsClient() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [items, setItems] = React.useState<LeadItem[]>([]);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);

  // filters
  const [limit, setLimit] = React.useState<number>(50);
  const [includeDeleted, setIncludeDeleted] = React.useState(false);

  const [formId, setFormId] = React.useState<string>("");
  const [eventId, setEventId] = React.useState<string>(""); // ""=all, "none"=null, else id

  const [from, setFrom] = React.useState<string>("");
  const [to, setTo] = React.useState<string>("");

  // lookups
  const [forms, setForms] = React.useState<FormItem[]>([]);
  const [events, setEvents] = React.useState<EventItem[]>([]);

  const formsById = React.useMemo(() => new Map(forms.map((f) => [f.id, f])), [forms]);
  const eventsById = React.useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);

  async function loadLookups() {
    // forms
    const fRes = await adminFetchJson<unknown>("/api/admin/v1/forms?limit=200", { method: "GET" });
    if (fRes.ok) {
      const arr = pickArray(fRes.data);
      const parsed: FormItem[] = arr.map((x) => (isRecord(x) ? (x as FormItem) : null)).filter(Boolean) as FormItem[];
      setForms(parsed);
    }

    // events
    const eRes = await adminFetchJson<unknown>("/api/admin/v1/events?limit=200", { method: "GET" });
    if (eRes.ok) {
      const arr = pickArray(eRes.data);
      const parsed: EventItem[] = arr.map((x) => (isRecord(x) ? (x as EventItem) : null)).filter(Boolean) as EventItem[];
      // Sort: startsAt desc
      parsed.sort((a, b) => {
        const sa = a.startsAt ? new Date(a.startsAt).getTime() : 0;
        const sb = b.startsAt ? new Date(b.startsAt).getTime() : 0;
        return sb - sa;
      });
      setEvents(parsed);
    }
  }

  function buildQuery(cursor?: string | null): string {
    const q = new URLSearchParams();
    q.set("limit", String(Math.max(1, Math.min(200, Math.floor(limit || 50)))));

    if (includeDeleted) q.set("includeDeleted", "true");
    if (formId) q.set("formId", formId);

    if (eventId === "none") q.set("eventId", "none");
    else if (eventId) q.set("eventId", eventId);

    // from/to (ISO)
    if (from) {
      const dt = new Date(from);
      if (!Number.isNaN(dt.getTime())) q.set("from", dt.toISOString());
    }
    if (to) {
      const dt = new Date(to);
      if (!Number.isNaN(dt.getTime())) q.set("to", dt.toISOString());
    }

    if (cursor) q.set("cursor", cursor);

    return q.toString();
  }

  async function loadPage(cursor?: string | null, mode: "replace" | "append" = "replace") {
    setLoading(true);
    setError(null);

    const qs = buildQuery(cursor ?? null);
    const url = `/api/admin/v1/leads?${qs}`;

    const res = await adminFetchJson<unknown>(url, { method: "GET" });
    if (!res.ok) {
      setError(fmtErr(res));
      setLoading(false);
      return;
    }

    if (!isRecord(res.data)) {
      setError("Unexpected response shape from GET /api/admin/v1/leads");
      setLoading(false);
      return;
    }

    const d = res.data as Record<string, unknown>;
    const arr = Array.isArray(d.items) ? (d.items as unknown[]) : [];
    const parsed: LeadItem[] = arr.map((x) => (isRecord(x) ? (x as LeadItem) : null)).filter(Boolean) as LeadItem[];

    const nc = typeof d.nextCursor === "string" ? d.nextCursor : d.nextCursor === null ? null : null;

    if (mode === "append") setItems((prev) => [...prev, ...parsed]);
    else setItems(parsed);

    setNextCursor(nc);
    setLoading(false);
  }

  React.useEffect(() => {
    void loadLookups();
    void loadPage(null, "replace");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Leads</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Lead Inbox (MVP). Filter nach Form und Event. Event kommt automatisch vom Device (activeEventId), wenn Event status=ACTIVE.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-6">
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-medium text-neutral-700">Form</label>
            <select
              className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm"
              value={formId}
              onChange={(e) => setFormId(e.target.value)}
              disabled={loading}
            >
              <option value="">All forms</option>
              {forms.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} — {String(f.status || "").toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-medium text-neutral-700">Event</label>
            <select
              className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm"
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
              disabled={loading}
            >
              <option value="">All</option>
              <option value="none">— no event —</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name} — {String(ev.status || "").toUpperCase()}
                </option>
              ))}
            </select>
            <div className="mt-1 text-xs text-neutral-600">
              Tipp: Events verwalten unter <span className="font-mono">/admin/settings/events</span>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-700">From (local)</label>
            <input
              type="datetime-local"
              className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              disabled={loading}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-700">To (local)</label>
            <input
              type="datetime-local"
              className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              disabled={loading}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-700">Limit</label>
            <input
              type="number"
              min={1}
              max={200}
              className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              disabled={loading}
            />
            <label className="mt-2 flex items-center gap-2 text-xs text-neutral-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-neutral-300"
                checked={includeDeleted}
                onChange={(e) => setIncludeDeleted(e.target.checked)}
                disabled={loading}
              />
              Include deleted
            </label>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void loadPage(null, "replace")}
            className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
            disabled={loading}
          >
            {loading ? "Loading…" : "Apply filters"}
          </button>

          <button
            type="button"
            onClick={() => {
              setFormId("");
              setEventId("");
              setFrom("");
              setTo("");
              setIncludeDeleted(false);
              setLimit(50);
              setTimeout(() => void loadPage(null, "replace"), 0);
            }}
            className="rounded-xl border border-neutral-200 px-3 py-2 text-sm text-neutral-800 hover:bg-neutral-50"
            disabled={loading}
          >
            Reset
          </button>

          <a
            href="/admin/settings/events"
            className="rounded-xl border border-neutral-200 px-3 py-2 text-sm text-neutral-800 hover:bg-neutral-50"
          >
            Events
          </a>
          <a
            href="/admin/settings/mobile"
            className="rounded-xl border border-neutral-200 px-3 py-2 text-sm text-neutral-800 hover:bg-neutral-50"
          >
            Mobile Ops
          </a>
        </div>
      </div>

      {error ? <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div> : null}

      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-xs text-neutral-600">
            <tr>
              <th className="px-4 py-3">Captured</th>
              <th className="px-4 py-3">Form</th>
              <th className="px-4 py-3">Event</th>
              <th className="px-4 py-3">Preview</th>
              <th className="px-4 py-3">Lead ID</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>

          <tbody>
            {items.length === 0 && loading ? (
              <tr>
                <td className="px-4 py-4 text-neutral-600" colSpan={6}>
                  Loading…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-neutral-600" colSpan={6}>
                  No leads.
                </td>
              </tr>
            ) : (
              items.map((l) => {
                const f = formsById.get(l.formId);
                const ev = l.eventId ? eventsById.get(l.eventId) : null;

                const eventBadge = !l.eventId
                  ? { label: "no event", cls: chipClasses("none") }
                  : ev
                    ? {
                        label: ev.name,
                        cls:
                          String(ev.status || "").toUpperCase() === "ACTIVE"
                            ? chipClasses("active")
                            : String(ev.status || "").toUpperCase() === "DRAFT"
                              ? chipClasses("draft")
                              : chipClasses("archived"),
                      }
                    : { label: `event:${l.eventId.slice(0, 6)}…`, cls: chipClasses("event") };

                return (
                  <tr key={l.id} className="border-t border-neutral-100">
                    <td className="px-4 py-3 font-mono text-xs">{isoShort(l.capturedAt)}</td>

                    <td className="px-4 py-3">
                      <div className="text-sm text-neutral-900">{f?.name ?? `form:${l.formId.slice(0, 6)}…`}</div>
                      <div className="mt-1 text-xs text-neutral-600">{(f?.status ?? "").toUpperCase() || "—"}</div>
                    </td>

                    <td className="px-4 py-3">
                      <span className={eventBadge.cls}>{eventBadge.label}</span>
                      {ev?.location ? <div className="mt-1 text-xs text-neutral-600">{ev.location}</div> : null}
                    </td>

                    <td className="px-4 py-3 text-neutral-900">{leadPreview(l.values || {})}</td>

                    <td className="px-4 py-3 font-mono text-xs">{l.id}</td>

                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        className="rounded-xl border border-neutral-200 px-3 py-1.5 text-sm text-neutral-800 hover:bg-neutral-50"
                        onClick={async () => {
                          const ok = await copyToClipboard(l.id);
                          if (!ok) setError("Copy failed (clipboard blocked).");
                        }}
                      >
                        Copy ID
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="text-xs text-neutral-600">
          Items: <span className="font-mono">{items.length}</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadPage(null, "replace")}
            className="rounded-xl border border-neutral-200 px-3 py-2 text-sm text-neutral-800 hover:bg-neutral-50 disabled:opacity-60"
            disabled={loading}
          >
            Refresh
          </button>

          <button
            type="button"
            onClick={() => void loadPage(nextCursor, "append")}
            className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
            disabled={loading || !nextCursor}
          >
            Load more
          </button>
        </div>
      </div>
    </div>
  );
}
