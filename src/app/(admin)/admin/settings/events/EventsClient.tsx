"use client";

import * as React from "react";
import { adminFetchJson } from "../../_lib/adminFetch";

type EventStatus = "DRAFT" | "ACTIVE" | "ARCHIVED" | string;

type EventItem = {
  id: string;
  name: string;
  status: EventStatus;
  location?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
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

// Convert ISO -> datetime-local (best-effort)
function toDateTimeLocalValue(iso?: string | null): string {
  if (!iso) return "";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "";
  // local datetime-local wants "YYYY-MM-DDTHH:mm"
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = dt.getFullYear();
  const mm = pad(dt.getMonth() + 1);
  const dd = pad(dt.getDate());
  const hh = pad(dt.getHours());
  const mi = pad(dt.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function fromDateTimeLocalValue(v: string): string | null {
  const s = (v || "").trim();
  if (!s) return null;
  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

function chipClasses(status: string): string {
  const s = (status || "").toUpperCase();
  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border";
  if (s === "ACTIVE") return `${base} bg-emerald-50 text-emerald-900 border-emerald-200`;
  if (s === "DRAFT") return `${base} bg-sky-50 text-sky-900 border-sky-200`;
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
  const [items, setItems] = React.useState<EventItem[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  // Create form
  const [createOpen, setCreateOpen] = React.useState(false);
  const [cName, setCName] = React.useState("");
  const [cLocation, setCLocation] = React.useState("");
  const [cStartsAt, setCStartsAt] = React.useState("");
  const [cEndsAt, setCEndsAt] = React.useState("");
  const [cStatus, setCStatus] = React.useState<EventStatus>("DRAFT");
  const [creating, setCreating] = React.useState(false);

  // Editing (inline per row)
  const [savingId, setSavingId] = React.useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const res = await adminFetchJson<unknown>("/api/admin/v1/events?limit=200", { method: "GET" });
    if (!res.ok) {
      setItems([]);
      setError(fmtErr(res));
      setLoading(false);
      return;
    }

    const rows = pickArray(res.data);
    const parsed: EventItem[] = rows
      .map((r) => (isRecord(r) ? (r as EventItem) : null))
      .filter(Boolean) as EventItem[];

    // sort: startsAt desc then createdAt
    parsed.sort((a, b) => {
      const sa = a.startsAt ? new Date(a.startsAt).getTime() : 0;
      const sb = b.startsAt ? new Date(b.startsAt).getTime() : 0;
      if (sb !== sa) return sb - sa;
      const ca = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const cb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return cb - ca;
    });

    setItems(parsed);
    setLoading(false);
  }

  React.useEffect(() => {
    void load();
  }, []);

  function openCreate() {
    setCreateOpen(true);
    setCName("");
    setCLocation("");
    setCStartsAt("");
    setCEndsAt("");
    setCStatus("DRAFT");
    setCreating(false);
  }

  async function onCreate() {
    const name = cName.trim();
    if (!name) {
      setError("Name darf nicht leer sein.");
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const payload: Record<string, unknown> = {
        name,
        status: cStatus || "DRAFT",
      };

      const loc = cLocation.trim();
      if (loc) payload.location = loc;

      const startsAtIso = fromDateTimeLocalValue(cStartsAt);
      const endsAtIso = fromDateTimeLocalValue(cEndsAt);
      if (startsAtIso) payload.startsAt = startsAtIso;
      if (endsAtIso) payload.endsAt = endsAtIso;

      const res = await adminFetchJson<unknown>("/api/admin/v1/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        setError(fmtErr(res));
        return;
      }

      setCreateOpen(false);
      await load();
    } finally {
      setCreating(false);
    }
  }

  async function patchEvent(id: string, patch: Record<string, unknown>) {
    setSavingId(id);
    setError(null);
    try {
      const res = await adminFetchJson<unknown>(`/api/admin/v1/events/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        setError(fmtErr(res));
        return;
      }
      await load();
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Events</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Messe-/Event-Verwaltung (MVP): erstellen, aktivieren, archivieren. Devices können im Mobile Ops Screen an ein ACTIVE Event gebunden werden.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openCreate}
            className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Create event
          </button>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-xl border border-neutral-200 px-3 py-2 text-sm text-neutral-800 hover:bg-neutral-50"
          >
            Refresh
          </button>
          <a
            href="/admin/settings/mobile"
            className="rounded-xl border border-neutral-200 px-3 py-2 text-sm text-neutral-800 hover:bg-neutral-50"
          >
            Go to Mobile Ops
          </a>
        </div>
      </div>

      {error ? <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div> : null}

      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-xs text-neutral-600">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Starts</th>
              <th className="px-4 py-3">Ends</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-4 text-neutral-600" colSpan={7}>
                  Loading…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-neutral-600" colSpan={7}>
                  No events yet.
                </td>
              </tr>
            ) : (
              items.map((e) => {
                const busy = savingId === e.id;
                const status = (e.status || "—").toString().toUpperCase();

                return (
                  <tr key={e.id} className="border-t border-neutral-100">
                    <td className="px-4 py-3">
                      <input
                        className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm"
                        defaultValue={e.name ?? ""}
                        onBlur={(ev) => {
                          const name = ev.target.value.trim();
                          if (name && name !== e.name) void patchEvent(e.id, { name });
                        }}
                        disabled={busy}
                      />
                    </td>

                    <td className="px-4 py-3">
                      <select
                        className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm"
                        value={status}
                        onChange={(ev) => void patchEvent(e.id, { status: ev.target.value })}
                        disabled={busy}
                      >
                        <option value="DRAFT">DRAFT</option>
                        <option value="ACTIVE">ACTIVE</option>
                        <option value="ARCHIVED">ARCHIVED</option>
                      </select>
                      <div className="mt-1">
                        <span className={chipClasses(status)}>{status}</span>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <input
                        type="datetime-local"
                        className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm"
                        defaultValue={toDateTimeLocalValue(e.startsAt ?? null)}
                        onBlur={(ev) => {
                          const iso = fromDateTimeLocalValue(ev.target.value);
                          // send null to clear
                          void patchEvent(e.id, { startsAt: iso ?? null });
                        }}
                        disabled={busy}
                      />
                      <div className="mt-1 text-xs text-neutral-600">{isoShort(e.startsAt ?? null)}</div>
                    </td>

                    <td className="px-4 py-3">
                      <input
                        type="datetime-local"
                        className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm"
                        defaultValue={toDateTimeLocalValue(e.endsAt ?? null)}
                        onBlur={(ev) => {
                          const iso = fromDateTimeLocalValue(ev.target.value);
                          void patchEvent(e.id, { endsAt: iso ?? null });
                        }}
                        disabled={busy}
                      />
                      <div className="mt-1 text-xs text-neutral-600">{isoShort(e.endsAt ?? null)}</div>
                    </td>

                    <td className="px-4 py-3">
                      <input
                        className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm"
                        defaultValue={(e.location ?? "") as string}
                        placeholder="optional"
                        onBlur={(ev) => {
                          const v = ev.target.value.trim();
                          // send null to clear
                          void patchEvent(e.id, { location: v ? v : null });
                        }}
                        disabled={busy}
                      />
                    </td>

                    <td className="px-4 py-3">
                      <div className="font-mono text-xs">{e.id}</div>
                      <button
                        type="button"
                        className="mt-1 rounded-xl border border-neutral-200 px-2 py-1 text-xs text-neutral-800 hover:bg-neutral-50"
                        onClick={async () => {
                          const ok = await copyToClipboard(e.id);
                          if (!ok) setError("Copy failed (clipboard blocked).");
                        }}
                      >
                        Copy
                      </button>
                    </td>

                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => void patchEvent(e.id, { status: "ACTIVE" })}
                          className="rounded-xl border border-neutral-200 px-3 py-1.5 text-sm text-neutral-800 hover:bg-neutral-50 disabled:opacity-60"
                          disabled={busy || status === "ACTIVE"}
                        >
                          Activate
                        </button>
                        <button
                          type="button"
                          onClick={() => void patchEvent(e.id, { status: "ARCHIVED" })}
                          className="rounded-xl border border-neutral-200 px-3 py-1.5 text-sm text-neutral-800 hover:bg-neutral-50 disabled:opacity-60"
                          disabled={busy || status === "ARCHIVED"}
                        >
                          Archive
                        </button>
                      </div>
                      <div className="mt-1 text-xs text-neutral-600">{busy ? "Saving…" : " "}</div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Create modal */}
      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-neutral-200 bg-white p-5 shadow-lg">
            <div className="mb-3">
              <div className="text-sm font-medium text-neutral-900">Create event</div>
              <div className="text-xs text-neutral-600">MVP Felder: Name, Zeitraum, Location, Status.</div>
            </div>

            <label className="mb-1 block text-xs font-medium text-neutral-700">Name</label>
            <input
              className="mb-3 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm"
              value={cName}
              onChange={(e) => setCName(e.target.value)}
              placeholder="z.B. Swissbau 2026"
              disabled={creating}
            />

            <label className="mb-1 block text-xs font-medium text-neutral-700">Status</label>
            <select
              className="mb-3 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm"
              value={cStatus}
              onChange={(e) => setCStatus(e.target.value)}
              disabled={creating}
            >
              <option value="DRAFT">DRAFT</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="ARCHIVED">ARCHIVED</option>
            </select>

            <label className="mb-1 block text-xs font-medium text-neutral-700">Location (optional)</label>
            <input
              className="mb-3 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm"
              value={cLocation}
              onChange={(e) => setCLocation(e.target.value)}
              placeholder="z.B. Messe Basel"
              disabled={creating}
            />

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-700">Starts (optional)</label>
                <input
                  type="datetime-local"
                  className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm"
                  value={cStartsAt}
                  onChange={(e) => setCStartsAt(e.target.value)}
                  disabled={creating}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-700">Ends (optional)</label>
                <input
                  type="datetime-local"
                  className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm"
                  value={cEndsAt}
                  onChange={(e) => setCEndsAt(e.target.value)}
                  disabled={creating}
                />
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="rounded-xl border border-neutral-200 px-3 py-2 text-sm text-neutral-800 hover:bg-neutral-50"
                disabled={creating}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void onCreate()}
                className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
                disabled={creating}
              >
                {creating ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
