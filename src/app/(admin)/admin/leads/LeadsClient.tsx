"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { adminFetchJson as _adminFetchJson } from "../_lib/adminFetch";
import LeadDetailDrawer from "./LeadDetailDrawer";
import LeadsTable from "./LeadsTable";
import type {
  AdminFormListItem,
  AdminFormsListData,
  AdminLeadListItem,
  AdminLeadsListData,
  ApiResponse,
} from "./leads.types";

type AdminFetchJsonFn = <T = unknown>(path: string, init?: RequestInit) => Promise<T>;

const adminFetchJson = _adminFetchJson as unknown as AdminFetchJsonFn;

type EventListItem = { id: string; name: string; status?: string; startsAt?: string | null; endsAt?: string | null };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function toIsoFromDateInput(value: string, endOfDay: boolean): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  if (endOfDay) {
    d.setHours(23, 59, 59, 999);
  } else {
    d.setHours(0, 0, 0, 0);
  }
  return d.toISOString();
}

function safePreviewFromValues(values?: Record<string, unknown> | null): string {
  if (!values || typeof values !== "object") return "—";

  const pick = (k: string): string | null => {
    const v = (values as Record<string, unknown>)[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
    return null;
  };

  const candidates = [
    "company",
    "firma",
    "organization",
    "email",
    "eMail",
    "mail",
    "lastName",
    "lastname",
    "nachname",
    "firstName",
    "firstname",
    "vorname",
    "name",
  ];

  const parts: string[] = [];
  for (const k of candidates) {
    const v = pick(k);
    if (v && !parts.includes(v)) parts.push(v);
    if (parts.length >= 3) break;
  }

  if (parts.length > 0) return parts.join(" · ");
  return "—";
}

function mergeUniqueById(existing: AdminLeadListItem[], incoming: AdminLeadListItem[]) {
  const map = new Map<string, AdminLeadListItem>();
  for (const it of existing) map.set(it.id, it);
  for (const it of incoming) map.set(it.id, it);
  return Array.from(map.values());
}

function extractForms(payload: AdminFormsListData | AdminFormListItem[] | unknown): AdminFormListItem[] {
  if (Array.isArray(payload)) return payload as AdminFormListItem[];
  if (!payload || typeof payload !== "object") return [];
  const p = payload as AdminFormsListData;
  return (p.items ?? p.forms ?? []) as AdminFormListItem[];
}

function extractLeadsList(payload: AdminLeadsListData | unknown): { items: AdminLeadListItem[]; nextCursor: string | null } {
  if (!payload || typeof payload !== "object") return { items: [], nextCursor: null };
  const p = payload as AdminLeadsListData;
  const items = (p.items ?? p.leads ?? []) as AdminLeadListItem[];
  const nextCursor = (p.nextCursor ?? p.cursor ?? null) as string | null;
  return { items, nextCursor };
}

function extractEvents(payload: unknown): EventListItem[] {
  const arr: unknown[] = (() => {
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
  })();

  return arr
    .map((x) => {
      if (!isRecord(x)) return null;
      const id = typeof x.id === "string" ? x.id : "";
      const name = typeof x.name === "string" ? x.name : "";
      if (!id || !name) return null;
      return {
        id,
        name,
        status: typeof x.status === "string" ? x.status : undefined,
        startsAt: typeof x.startsAt === "string" ? x.startsAt : x.startsAt === null ? null : undefined,
        endsAt: typeof x.endsAt === "string" ? x.endsAt : x.endsAt === null ? null : undefined,
      } satisfies EventListItem;
    })
    .filter(Boolean) as EventListItem[];
}

type LoadState = "idle" | "loading" | "error";

export default function LeadsClient() {
  // Filters
  const [formId, setFormId] = useState<string>("");
  const [eventId, setEventId] = useState<string>("");
  const [includeDeleted, setIncludeDeleted] = useState<boolean>(false);
  const [fromDate, setFromDate] = useState<string>(""); // YYYY-MM-DD
  const [toDate, setToDate] = useState<string>(""); // YYYY-MM-DD
  const [limit, setLimit] = useState<number>(50);

  // Events map (for filter dropdown)
  const [eventsState, setEventsState] = useState<LoadState>("idle");
  const [events, setEvents] = useState<EventListItem[]>([]);
  const eventsById = useMemo(() => {
    const m = new Map<string, EventListItem>();
    for (const e of events) m.set(e.id, e);
    return m;
  }, [events]);

  // Forms map (for display + filter dropdown)
  const [formsState, setFormsState] = useState<LoadState>("idle");
  const [forms, setForms] = useState<AdminFormListItem[]>([]);
  const formsById = useMemo(() => {
    const m = new Map<string, AdminFormListItem>();
    for (const f of forms) m.set(f.id, f);
    return m;
  }, [forms]);

  // Leads list + cursor
  const [listState, setListState] = useState<LoadState>("idle");
  const [items, setItems] = useState<AdminLeadListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [traceId, setTraceId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");

  const [loadingMore, setLoadingMore] = useState<boolean>(false);

  // Drawer
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  // Avoid out-of-order list responses overwriting newer state
  const listReqSeq = useRef(0);

  const loadEvents = useCallback(async () => {
    setEventsState("loading");
    try {
      const res = (await adminFetchJson<ApiResponse<unknown>>("/api/admin/v1/events?status=ACTIVE&limit=200", {
        method: "GET",
      })) as ApiResponse<unknown>;
      if (!res.ok) {
        setEventsState("error");
        setTraceId(res.traceId ?? null);
        setErrorMessage(res.error?.message || "Failed to load events.");
        return;
      }
      const list = extractEvents(res.data);
      setEvents(list);
      setEventsState("idle");
    } catch (e) {
      setEventsState("error");
      setErrorMessage(e instanceof Error ? e.message : "Failed to load events.");
    }
  }, []);

  const loadForms = useCallback(async () => {
    setFormsState("loading");
    try {
      const res = (await adminFetchJson<ApiResponse<AdminFormsListData | AdminFormListItem[]>>(
        "/api/admin/v1/forms",
        { method: "GET" }
      )) as ApiResponse<AdminFormsListData | AdminFormListItem[]>;
      if (!res.ok) {
        setFormsState("error");
        setTraceId(res.traceId ?? null);
        setErrorMessage(res.error?.message || "Failed to load forms.");
        return;
      }
      const list = extractForms(res.data);
      setForms(list);
      setFormsState("idle");
    } catch (e) {
      setFormsState("error");
      setErrorMessage(e instanceof Error ? e.message : "Failed to load forms.");
    }
  }, []);

  const buildListQuery = useCallback(
    (cursor?: string | null) => {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      if (cursor) params.set("cursor", cursor);
      if (formId) params.set("formId", formId);
      if (eventId) params.set("eventId", eventId);
      if (includeDeleted) params.set("includeDeleted", "true");

      const fromIso = toIsoFromDateInput(fromDate, false);
      const toIso = toIsoFromDateInput(toDate, true);
      if (fromIso) params.set("from", fromIso);
      if (toIso) params.set("to", toIso);

      return `/api/admin/v1/leads?${params.toString()}`;
    },
    [formId, eventId, includeDeleted, fromDate, toDate, limit]
  );

  const loadLeadsFirstPage = useCallback(async () => {
    const seq = ++listReqSeq.current;

    setListState("loading");
    setErrorMessage("");
    setTraceId(null);
    setItems([]);
    setNextCursor(null);

    try {
      const url = buildListQuery(null);
      const res = (await adminFetchJson<ApiResponse<AdminLeadsListData>>(
        url,
        { method: "GET" }
      )) as ApiResponse<AdminLeadsListData>;

      if (seq !== listReqSeq.current) return;

      if (!res.ok) {
        setListState("error");
        setTraceId(res.traceId ?? null);
        setErrorMessage(res.error?.message || "Failed to load leads.");
        return;
      }

      const { items: listItems, nextCursor: nc } = extractLeadsList(res.data);
      setItems(listItems);
      setNextCursor(nc);
      setListState("idle");
    } catch (e) {
      if (seq !== listReqSeq.current) return;
      setListState("error");
      setErrorMessage(e instanceof Error ? e.message : "Failed to load leads.");
    }
  }, [buildListQuery]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;

    setLoadingMore(true);
    setErrorMessage("");
    setTraceId(null);

    try {
      const url = buildListQuery(nextCursor);
      const res = (await adminFetchJson<ApiResponse<AdminLeadsListData>>(
        url,
        { method: "GET" }
      )) as ApiResponse<AdminLeadsListData>;

      if (!res.ok) {
        setTraceId(res.traceId ?? null);
        setErrorMessage(res.error?.message || "Failed to load more leads.");
        setLoadingMore(false);
        return;
      }

      const { items: moreItems, nextCursor: nc } = extractLeadsList(res.data);
      setItems((prev) => mergeUniqueById(prev, moreItems));
      setNextCursor(nc);
      setLoadingMore(false);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "Failed to load more leads.");
      setLoadingMore(false);
    }
  }, [buildListQuery, loadingMore, nextCursor]);

  const refresh = useCallback(async () => {
    await loadLeadsFirstPage();
  }, [loadLeadsFirstPage]);

  // initial
  useEffect(() => {
    const t = setTimeout(() => {
      void loadEvents();
      void loadForms();
    }, 0);
    return () => clearTimeout(t);
  }, [loadEvents, loadForms]);

  useEffect(() => {
    const t = setTimeout(() => {
      void loadLeadsFirstPage();
    }, 0);
    return () => clearTimeout(t);
  }, [loadLeadsFirstPage]);

  const onFiltersChanged = useCallback(() => {
    void loadLeadsFirstPage();
  }, [loadLeadsFirstPage]);

  // refresh list after a mutation (delete/restore)
  const onLeadMutated = useCallback(
    async (leadId: string) => {
      await loadLeadsFirstPage();
      setSelectedLeadId((prev) => (prev === leadId ? leadId : prev));
    },
    [loadLeadsFirstPage]
  );

  const headerRight = (
    <div className="flex items-center gap-2">
      <button type="button" className="rounded-md border px-3 py-2 text-sm hover:bg-black/5" onClick={refresh}>
        Refresh
      </button>
    </div>
  );

  const activeEventLabel = eventId ? eventsById.get(eventId)?.name ?? "Unknown event" : "All events";

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
          <p className="mt-1 text-sm text-black/60">
            Browse captured leads, open details, and soft-delete (restore optional).{" "}
            <span className="text-black/50">Filter: {activeEventLabel}</span>
          </p>
        </div>
        {headerRight}
      </div>

      {/* Filters */}
      <div className="mb-4 rounded-xl border bg-white p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="grid w-full grid-cols-1 gap-3 md:grid-cols-5">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-black/60">Event</label>
              <select
                className="h-10 rounded-md border bg-white px-3 text-sm"
                value={eventId}
                onChange={(e) => {
                  setEventId(e.target.value);
                  setTimeout(onFiltersChanged, 0);
                }}
                disabled={eventsState === "loading"}
              >
                <option value="">All events</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-black/60">Form</label>
              <select
                className="h-10 rounded-md border bg-white px-3 text-sm"
                value={formId}
                onChange={(e) => {
                  setFormId(e.target.value);
                  setTimeout(onFiltersChanged, 0);
                }}
                disabled={formsState === "loading"}
              >
                <option value="">All forms</option>
                {forms.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-black/60">Date from</label>
              <input
                type="date"
                className="h-10 rounded-md border bg-white px-3 text-sm"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                onBlur={onFiltersChanged}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-black/60">Date to</label>
              <input
                type="date"
                className="h-10 rounded-md border bg-white px-3 text-sm"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                onBlur={onFiltersChanged}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-black/60">Page size</label>
              <select
                className="h-10 rounded-md border bg-white px-3 text-sm"
                value={String(limit)}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setLimit(v);
                  setTimeout(onFiltersChanged, 0);
                }}
              >
                <option value="25">25</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </div>
          </div>

          <div className="flex w-full items-center justify-between gap-3 md:w-auto md:justify-end">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={includeDeleted}
                onChange={(e) => {
                  setIncludeDeleted(e.target.checked);
                  setTimeout(onFiltersChanged, 0);
                }}
              />
              <span>Show deleted</span>
            </label>

            <button
              type="button"
              className="rounded-md border px-3 py-2 text-sm hover:bg-black/5"
              onClick={() => {
                setEventId("");
                setFormId("");
                setIncludeDeleted(false);
                setFromDate("");
                setToDate("");
                setLimit(50);
                setTimeout(onFiltersChanged, 0);
              }}
            >
              Reset
            </button>
          </div>
        </div>

        {(eventsState === "error" || formsState === "error") && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
            <div className="font-medium text-red-800">Could not load filter lists.</div>
            <div className="mt-1 text-red-800/80">Event/Form dropdown may be incomplete.</div>
            <div className="mt-2 flex items-center gap-2">
              <button type="button" className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm hover:bg-white/60" onClick={() => void loadEvents()}>
                Retry events
              </button>
              <button type="button" className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm hover:bg-white/60" onClick={() => void loadForms()}>
                Retry forms
              </button>
              {traceId && <span className="text-xs text-red-800/70">traceId: {traceId}</span>}
            </div>
          </div>
        )}
      </div>

      {/* States */}
      {listState === "loading" && <LoadingSkeleton />}

      {listState === "error" && (
        <ErrorPanel
          title="Could not load leads."
          message={errorMessage || "Something went wrong while fetching leads."}
          traceId={traceId}
          onRetry={() => void loadLeadsFirstPage()}
        />
      )}

      {listState === "idle" && items.length === 0 && <EmptyPanel />}

      {listState === "idle" && items.length > 0 && (
        <>
          <div className="mb-2 flex items-center justify-between text-sm text-black/60">
            <div>
              Showing <span className="font-medium text-black/80">{items.length}</span> lead(s)
            </div>
            <div className="hidden md:block">Captured times are shown in your local timezone.</div>
          </div>

          <LeadsTable
            rows={items}
            formsById={formsById}
            formatCapturedAt={formatDateTime}
            getPreview={(row) => (row.preview && row.preview.trim() ? row.preview : safePreviewFromValues(row.values))}
            onOpen={(id) => setSelectedLeadId(id)}
            hasMore={Boolean(nextCursor)}
            loadingMore={loadingMore}
            onLoadMore={() => void loadMore()}
          />
        </>
      )}

      <LeadDetailDrawer
        open={Boolean(selectedLeadId)}
        leadId={selectedLeadId}
        onClose={() => setSelectedLeadId(null)}
        formsById={formsById}
        formatCapturedAt={formatDateTime}
        onMutated={(id) => void onLeadMutated(id)}
      />

      <div className="mt-6 text-sm text-black/60">
        Need a form first?{" "}
        <Link href="/admin/forms" className="font-medium text-black underline underline-offset-4">
          Go to Forms
        </Link>
        .
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="mb-4 h-4 w-40 animate-pulse rounded bg-black/10" />
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="grid grid-cols-12 gap-3">
            <div className="col-span-3 h-9 animate-pulse rounded bg-black/10" />
            <div className="col-span-3 h-9 animate-pulse rounded bg-black/10" />
            <div className="col-span-4 h-9 animate-pulse rounded bg-black/10" />
            <div className="col-span-2 h-9 animate-pulse rounded bg-black/10" />
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyPanel() {
  return (
    <div className="rounded-xl border bg-white p-10 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border bg-black/5">
        <span className="text-xl">◎</span>
      </div>
      <h2 className="text-lg font-semibold">No leads yet</h2>
      <p className="mt-2 text-sm text-black/60">
        Create a form, activate it, and start capturing leads in the app. When the first lead arrives, it will show up
        here.
      </p>
      <div className="mt-5 flex items-center justify-center gap-2">
        <Link href="/admin/forms" className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-black/5">
          Create / Manage forms
        </Link>
      </div>
    </div>
  );
}

function ErrorPanel(props: { title: string; message: string; traceId?: string | null; onRetry: () => void }) {
  const { title, message, traceId, onRetry } = props;

  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4">
      <div className="font-semibold text-red-800">{title}</div>
      <div className="mt-1 text-sm text-red-800/80">{message}</div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm hover:bg-white/60" onClick={onRetry}>
          Retry
        </button>

        {traceId && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-red-800/70">traceId: {traceId}</span>
            <button
              type="button"
              className="rounded-md border border-red-200 bg-white px-2 py-1 text-xs hover:bg-white/60"
              onClick={() => void navigator.clipboard.writeText(traceId)}
            >
              Copy
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
