// src/app/(admin)/admin/leads/LeadsClient.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type ApiOk<T> = { ok: true; data: T; traceId: string };
type ApiErr = { ok: false; error: { code: string; message: string; details?: unknown }; traceId: string };
type ApiResp<T> = ApiOk<T> | ApiErr;

type ActiveEventApi = {
  item: null | {
    id: string;
    name: string;
    status: "ACTIVE" | "DRAFT" | "ARCHIVED";
  };
};

type LeadListItem = {
  id: string;

  createdAt: string;
  updatedAt: string;

  capturedAt?: string;
  formId?: string;
  eventId?: string | null;

  contactName: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;

  event: { id: string; name: string } | null;

  reviewedAt: string | null;
  reviewStatus: "NEW" | "REVIEWED";

  hasCardAttachment: boolean;
  hasOcr: boolean;

  sourceDeviceName: string | null;
};

type LeadsListApi = { items: LeadListItem[]; nextCursor: string | null };

type LeadDetail = {
  id: string;

  createdAt: string | null;
  updatedAt: string | null;
  capturedAt: string | null;

  eventId: string | null;
  formId: string;

  reviewedAt: string | null;
  reviewStatus: "NEW" | "REVIEWED";

  adminNotes: string | null;

  contact: {
    firstName: string | null;
    lastName: string | null;
    name: string | null;
    company: string | null;
    email: string | null;
    phone: string | null;
    phoneRaw: string | null;
    mobile: string | null;
    source: string | null;
    updatedAt: string | null;
  };

  sourceDeviceName: string | null;

  event: { id: string; name: string } | null;
  form: { id: string; name: string } | null;

  attachments: Array<{
    id: string;
    type: string;
    filename: string;
    mimeType: string | null;
    sizeBytes: number | null;
    createdAt: string | null;
  }>;

  hasCardAttachment?: boolean;
  values?: unknown;
  meta?: unknown;
};

type OcrView = {
  id: string;
  status: string;
  engine: string;
  confidence: number | null;
  rawText: string | null;
  parsedContactJson: unknown | null;
  correctedContactJson: unknown | null;
};

type OcrApi = {
  attachment: { id: string; filename: string; mimeType: string | null } | null;
  ocr: OcrView | null;
};

type OcrResp = {
  attachment: { id: string; filename: string; mimeType: string | null } | null;
  ocr: OcrView | null;
};

type UiError = { message: string; code?: string; traceId?: string };

type SortOpt = "CREATED_DESC" | "CREATED_ASC" | "NAME_ASC" | "NAME_DESC";

function errMessage(err: UiError | null): string {
  return err?.message ?? "";
}
function errTraceId(err: UiError | null): string | undefined {
  return err?.traceId;
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("de-CH", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function statusLabel(s: "NEW" | "REVIEWED"): string {
  return s === "REVIEWED" ? "Bearbeitet" : "Neu";
}

function statusPillClasses(s: "NEW" | "REVIEWED"): string {
  if (s === "REVIEWED") return "border-slate-200 bg-slate-50 text-slate-700";
  return "border-amber-200 bg-amber-50 text-amber-900";
}

function Button({
  label,
  kind,
  onClick,
  disabled,
  title,
}: {
  label: string;
  kind: "primary" | "secondary" | "ghost" | "danger";
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}) {
  const base =
    "inline-flex items-center justify-center rounded-xl px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-slate-200";
  const primary = "bg-slate-900 text-white hover:bg-slate-800";
  const secondary = "border border-slate-200 bg-white text-slate-900 hover:bg-slate-50";
  const ghost = "text-slate-700 hover:bg-slate-100";
  const danger = "border border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100";

  const cls = `${base} ${
    kind === "primary" ? primary : kind === "secondary" ? secondary : kind === "danger" ? danger : ghost
  } ${disabled ? "opacity-50 pointer-events-none" : ""}`;

  return (
    <button type="button" className={cls} onClick={onClick} disabled={disabled} title={title}>
      {label}
    </button>
  );
}

function IconButton({ title, onClick }: { title: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-200"
      aria-label={title}
      title={title}
      onClick={onClick}
    >
      ↻
    </button>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  widthClass,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  widthClass?: string;
}) {
  return (
    <input
      className={`h-9 ${widthClass ?? "w-[260px]"} rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200`}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function Select({
  value,
  onChange,
  ariaLabel,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <select
      className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
      value={value}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
    >
      {children}
    </select>
  );
}

function DrawerShell({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button type="button" className="absolute inset-0 bg-black/20" aria-label="Schliessen" onClick={onClose} />
      <aside className="absolute right-0 top-0 h-full w-full max-w-[520px] bg-white shadow-2xl">
        <div className="flex h-14 items-center justify-between border-b border-slate-200 px-6">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-900">{title}</div>
          </div>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-xl px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-200"
            onClick={onClose}
          >
            Schliessen
          </button>
        </div>
        <div className="h-[calc(100%-3.5rem)] overflow-auto px-6 py-6">{children}</div>
      </aside>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-3 text-sm font-semibold text-slate-900">{title}</div>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-xs font-medium text-slate-600">{label}</div>
      <input
        className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-xs font-medium text-slate-600">{label}</div>
      <textarea
        className="min-h-[100px] w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function StatusPills({
  value,
  onChange,
}: {
  value: "ALL" | "NEW" | "REVIEWED";
  onChange: (v: "ALL" | "NEW" | "REVIEWED") => void;
}) {
  const pillBase =
    "inline-flex h-9 items-center justify-center rounded-full border px-3 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-slate-200";

  const pill = (active: boolean) =>
    active
      ? `${pillBase} border-slate-900 bg-slate-900 text-white`
      : `${pillBase} border-slate-200 bg-white text-slate-700 hover:bg-slate-50`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className={pill(value === "ALL")} onClick={() => onChange("ALL")}>
        Alle
      </button>
      <button type="button" className={pill(value === "NEW")} onClick={() => onChange("NEW")}>
        Neu
      </button>
      <button type="button" className={pill(value === "REVIEWED")} onClick={() => onChange("REVIEWED")}>
        Bearbeitet
      </button>
    </div>
  );
}

export default function LeadsClient() {
  const router = useRouter();

  const [activeEvent, setActiveEvent] = useState<ActiveEventApi["item"]>(null);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"ALL" | "NEW" | "REVIEWED">("ALL");
  const [sortOpt, setSortOpt] = useState<SortOpt>("CREATED_DESC");

  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<UiError | null>(null);

  const [items, setItems] = useState<LeadListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detail, setDetail] = useState<LeadDetail | null>(null);
  const [drawerErr, setDrawerErr] = useState<UiError | null>(null);

  const [draftFirst, setDraftFirst] = useState("");
  const [draftLast, setDraftLast] = useState("");
  const [draftCompany, setDraftCompany] = useState("");
  const [draftEmail, setDraftEmail] = useState("");
  const [draftPhone, setDraftPhone] = useState("");
  const [draftMobile, setDraftMobile] = useState("");
  const [draftNotes, setDraftNotes] = useState("");

  const [saving, setSaving] = useState(false);

  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState<UiError | null>(null);
  const [ocrData, setOcrData] = useState<OcrApi | null>(null);
  const [ocrApplying, setOcrApplying] = useState(false);

  const [exportNavBusy, setExportNavBusy] = useState(false);

  // ✅ E-Mail forwarding (TP7.5 MVP)
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [emailIncludeValues, setEmailIncludeValues] = useState(true);
  const [emailIncludePdf, setEmailIncludePdf] = useState(true);
  const [emailSending, setEmailSending] = useState(false);
  const [emailResult, setEmailResult] = useState<{ delivered: boolean; mode: "smtp" | "log" } | null>(null);
  const [emailError, setEmailError] = useState<UiError | null>(null);
  const emailInitRef = useRef(false);

  const autoInitRef = useRef(false);

  const { sort, dir } = useMemo(() => {
    if (sortOpt === "CREATED_ASC") return { sort: "createdAt" as const, dir: "asc" as const };
    if (sortOpt === "NAME_ASC") return { sort: "name" as const, dir: "asc" as const };
    if (sortOpt === "NAME_DESC") return { sort: "name" as const, dir: "desc" as const };
    return { sort: "createdAt" as const, dir: "desc" as const };
  }, [sortOpt]);

  const isDirtyFilters = useMemo(
    () => q.trim() !== "" || status !== "ALL" || sortOpt !== "CREATED_DESC",
    [q, status, sortOpt]
  );

  const countLabel = useMemo(() => {
    const n = items.length;
    return n === 1 ? "1 Lead" : `${n} Leads`;
  }, [items.length]);

  const selectedCount = useMemo(() => selectedIds.size, [selectedIds]);

  const buildListUrl = useCallback(
    (cursor?: string | null): string => {
      const sp = new URLSearchParams();
      if (q.trim()) sp.set("q", q.trim());
      sp.set("status", status);
      sp.set("sort", sort);
      sp.set("dir", dir);
      sp.set("take", "50");
      if (cursor) sp.set("cursor", cursor);
      return `/api/admin/v1/leads?${sp.toString()}`;
    },
    [q, status, sort, dir]
  );

  const loadActiveEvent = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/v1/events/active", { method: "GET", cache: "no-store" });
      const json = (await res.json()) as ApiResp<ActiveEventApi>;
      if (json.ok) setActiveEvent(json.data.item);
      else setActiveEvent(null);
    } catch {
      setActiveEvent(null);
    }
  }, []);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    setListError(null);

    try {
      const res = await fetch(buildListUrl(null), { method: "GET", cache: "no-store" });
      const json = (await res.json()) as ApiResp<LeadsListApi>;

      if (!json || typeof json !== "object") {
        setItems([]);
        setNextCursor(null);
        setListError({ message: "Ungültige Serverantwort." });
        setLoadingList(false);
        return;
      }

      if (!json.ok) {
        setItems([]);
        setNextCursor(null);
        setListError({
          message: json.error?.message || "Konnte Leads nicht laden.",
          code: json.error?.code,
          traceId: json.traceId,
        });
        setLoadingList(false);
        return;
      }

      const list = Array.isArray(json.data.items) ? json.data.items : [];
      setItems(list);
      setNextCursor(json.data.nextCursor ?? null);
      setLoadingList(false);
      setSelectedIds(new Set());
    } catch {
      setItems([]);
      setNextCursor(null);
      setListError({ message: "Konnte Leads nicht laden. Bitte erneut versuchen." });
      setLoadingList(false);
    }
  }, [buildListUrl]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);

    try {
      const res = await fetch(buildListUrl(nextCursor), { method: "GET", cache: "no-store" });
      const json = (await res.json()) as ApiResp<LeadsListApi>;

      if (json && typeof json === "object" && json.ok) {
        const more = Array.isArray(json.data.items) ? json.data.items : [];
        setItems((prev) => [...prev, ...more]);
        setNextCursor(json.data.nextCursor ?? null);
      }
    } catch {
      // ignore
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore, buildListUrl]);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadActiveEvent(), loadList()]);
  }, [loadActiveEvent, loadList]);

  useEffect(() => {
    if (autoInitRef.current) return;
    autoInitRef.current = true;
    const t = setTimeout(() => void refreshAll(), 0);
    return () => clearTimeout(t);
  }, [refreshAll]);

  // Debounced list reload on filters
  useEffect(() => {
    const t = setTimeout(() => void loadList(), 220);
    return () => clearTimeout(t);
  }, [q, status, sortOpt, loadList]);

  const resetFilters = useCallback(() => {
    setQ("");
    setStatus("ALL");
    setSortOpt("CREATED_DESC");
  }, []);

  const goToExportsPrefilled = useCallback(() => {
    if (exportNavBusy) return;

    setExportNavBusy(true);

    const sp = new URLSearchParams();
    sp.set("scope", "ALL");
    sp.set("leadStatus", status);

    const qq = q.trim();
    if (qq) sp.set("q", qq);

    router.push(`/admin/exports?${sp.toString()}`);
    window.setTimeout(() => setExportNavBusy(false), 1200);
  }, [exportNavBusy, router, status, q]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAllOnPage = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = items.length > 0 && items.every((it) => next.has(it.id));
      if (allSelected) {
        for (const it of items) next.delete(it.id);
      } else {
        for (const it of items) next.add(it.id);
      }
      return next;
    });
  }, [items]);

  const openDrawer = useCallback((id: string) => {
    emailInitRef.current = false;
    setEmailResult(null);
    setEmailError(null);
    setEmailSending(false);

    setSelectedId(id);
    setDrawerOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    setSelectedId(null);
    setDetail(null);
    setDrawerErr(null);
    setLoadingDetail(false);
    setSaving(false);

    setOcrData(null);
    setOcrError(null);
    setOcrLoading(false);
    setOcrApplying(false);

    // email reset
    emailInitRef.current = false;
    setEmailTo("");
    setEmailSubject("");
    setEmailMessage("");
    setEmailIncludeValues(true);
    setEmailIncludePdf(true);
    setEmailSending(false);
    setEmailResult(null);
    setEmailError(null);
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    setLoadingDetail(true);
    setDetail(null);
    setDrawerErr(null);

    try {
      const res = await fetch(`/api/admin/v1/leads/${id}`, { method: "GET", cache: "no-store" });
      const json = (await res.json()) as ApiResp<LeadDetail>;

      if (!json || typeof json !== "object") {
        setDetail(null);
        setDrawerErr({ message: "Ungültige Serverantwort." });
        setLoadingDetail(false);
        return;
      }

      if (!json.ok) {
        setDetail(null);
        setDrawerErr({
          message: json.error?.message || "Konnte Lead nicht laden.",
          code: json.error?.code,
          traceId: json.traceId,
        });
        setLoadingDetail(false);
        return;
      }

      const d = json.data;
      setDetail(d);

      setDraftFirst(d.contact?.firstName ?? "");
      setDraftLast(d.contact?.lastName ?? "");
      setDraftCompany(d.contact?.company ?? "");
      setDraftEmail(d.contact?.email ?? "");
      setDraftPhone(d.contact?.phoneRaw ?? "");
      setDraftMobile(d.contact?.mobile ?? "");
      setDraftNotes(d.adminNotes ?? "");

      if (!emailInitRef.current) {
        const nm = d.contact?.name ?? "";
        const co = d.contact?.company ?? "";
        const subjBase = nm && co ? `${nm} / ${co}` : nm || co || "Lead";
        setEmailSubject(`LeadRadar Lead: ${subjBase}`);
        setEmailMessage("");
        emailInitRef.current = true;
      }

      setLoadingDetail(false);
    } catch {
      setDetail(null);
      setDrawerErr({ message: "Konnte Lead nicht laden. Bitte erneut versuchen." });
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    if (!drawerOpen || !selectedId) return;
    const t = setTimeout(() => void loadDetail(selectedId), 0);
    return () => clearTimeout(t);
  }, [drawerOpen, selectedId, loadDetail]);

  const isDirtyDetail = useMemo(() => {
    if (!detail) return false;
    return (
      (draftFirst ?? "") !== (detail.contact?.firstName ?? "") ||
      (draftLast ?? "") !== (detail.contact?.lastName ?? "") ||
      (draftCompany ?? "") !== (detail.contact?.company ?? "") ||
      (draftEmail ?? "") !== (detail.contact?.email ?? "") ||
      (draftPhone ?? "") !== (detail.contact?.phoneRaw ?? "") ||
      (draftMobile ?? "") !== (detail.contact?.mobile ?? "") ||
      (draftNotes ?? "") !== (detail.adminNotes ?? "")
    );
  }, [detail, draftFirst, draftLast, draftCompany, draftEmail, draftPhone, draftMobile, draftNotes]);

  const saveDetail = useCallback(async () => {
    if (!detail || saving) return;
    setSaving(true);
    setDrawerErr(null);

    try {
      const body: Record<string, unknown> = {
        firstName: draftFirst,
        lastName: draftLast,
        company: draftCompany,
        email: draftEmail,
        phone: draftPhone,
        mobile: draftMobile,
        notes: draftNotes,
      };

      const res = await fetch(`/api/admin/v1/leads/${detail.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = (await res.json()) as ApiResp<LeadDetail>;
      if (!json || typeof json !== "object") {
        setDrawerErr({ message: "Ungültige Serverantwort." });
        setSaving(false);
        return;
      }

      if (!json.ok) {
        setDrawerErr({
          message: json.error?.message || "Konnte Änderungen nicht speichern.",
          code: json.error?.code,
          traceId: json.traceId,
        });
        setSaving(false);
        return;
      }

      setDetail(json.data);
      setDraftFirst(json.data.contact?.firstName ?? "");
      setDraftLast(json.data.contact?.lastName ?? "");
      setDraftCompany(json.data.contact?.company ?? "");
      setDraftEmail(json.data.contact?.email ?? "");
      setDraftPhone(json.data.contact?.phoneRaw ?? "");
      setDraftMobile(json.data.contact?.mobile ?? "");
      setDraftNotes(json.data.adminNotes ?? "");

      await loadList();
      setSaving(false);
    } catch {
      setDrawerErr({ message: "Konnte Änderungen nicht speichern. Bitte erneut versuchen." });
      setSaving(false);
    }
  }, [detail, saving, draftFirst, draftLast, draftCompany, draftEmail, draftPhone, draftMobile, draftNotes, loadList]);

  const toggleReviewed = useCallback(async () => {
    if (!detail) return;

    const nextReviewed = detail.reviewStatus !== "REVIEWED";

    try {
      const res = await fetch(`/api/admin/v1/leads/${detail.id}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reviewed: nextReviewed }),
      });

      const json = (await res.json()) as ApiResp<{ id: string; reviewed: boolean; reviewedAt: string | null }>;
      if (!json || typeof json !== "object") return;

      if (!json.ok) {
        setDrawerErr({
          message: json.error?.message || "Konnte Status nicht speichern.",
          code: json.error?.code,
          traceId: json.traceId,
        });
        return;
      }

      await loadDetail(detail.id);
      await loadList();
    } catch {
      setDrawerErr({ message: "Konnte Status nicht speichern. Bitte erneut versuchen." });
    }
  }, [detail, loadDetail, loadList]);

  const pickBusinessCardAttachment = useMemo(() => {
    if (!detail?.attachments?.length) return null;
    const list = detail.attachments;
    const bc = list.find((a) => String(a.type || "").toUpperCase() === "BUSINESS_CARD_IMAGE");
    if (bc) return bc;
    const img = list.find((a) => String(a.mimeType || "").toLowerCase().startsWith("image/"));
    return img ?? list[0] ?? null;
  }, [detail]);

  const loadOcr = useCallback(async () => {
    if (!detail || ocrLoading) return;
    setOcrLoading(true);
    setOcrError(null);
    setOcrData(null);

    try {
      const res = await fetch(`/api/admin/v1/leads/${detail.id}/ocr`, { method: "GET", cache: "no-store" });
      const json = (await res.json()) as ApiResp<OcrResp>;

      if (!json || typeof json !== "object") {
        setOcrError({ message: "Ungültige Serverantwort." });
        setOcrLoading(false);
        return;
      }

      if (!json.ok) {
        setOcrError({
          message: json.error?.message || "Konnte OCR nicht laden.",
          code: json.error?.code,
          traceId: json.traceId,
        });
        setOcrLoading(false);
        return;
      }

      setOcrData({ ocr: json.data.ocr ?? null, attachment: json.data.attachment ?? null });
      setOcrLoading(false);
    } catch {
      setOcrError({ message: "Konnte OCR nicht laden. Bitte erneut versuchen." });
      setOcrLoading(false);
    }
  }, [detail, ocrLoading]);

  const applyOcr = useCallback(async () => {
    if (!detail || !ocrData?.ocr?.id || ocrApplying) return;
    setOcrApplying(true);
    setOcrError(null);

    try {
      const res = await fetch(`/api/admin/v1/leads/${detail.id}/ocr/apply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ocrResultId: ocrData.ocr.id }),
      });

      const json = (await res.json()) as ApiResp<unknown>;
      if (!json || typeof json !== "object") {
        setOcrError({ message: "Ungültige Serverantwort." });
        setOcrApplying(false);
        return;
      }

      if (!json.ok) {
        setOcrError({
          message: json.error?.message || "Konnte OCR nicht anwenden.",
          code: json.error?.code,
          traceId: json.traceId,
        });
        setOcrApplying(false);
        return;
      }

      await loadDetail(detail.id);
      await loadList();
      setOcrApplying(false);
    } catch {
      setOcrError({ message: "Konnte OCR nicht anwenden. Bitte erneut versuchen." });
      setOcrApplying(false);
    }
  }, [detail, ocrData, ocrApplying, loadDetail, loadList]);

  const sendLeadEmail = useCallback(async () => {
    if (!detail || emailSending) return;

    const to = emailTo.trim();
    if (!to) {
      setEmailError({ message: "Bitte Empfänger-E-Mail angeben." });
      return;
    }

    setEmailSending(true);
    setEmailError(null);
    setEmailResult(null);

    try {
      const res = await fetch(`/api/admin/v1/leads/${detail.id}/email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          to,
          subject: emailSubject.trim() || undefined,
          message: emailMessage.trim() || undefined,
          includeValues: emailIncludeValues,
          includePdf: emailIncludePdf,
        }),
      });

      const json = (await res.json()) as ApiResp<{ delivered: boolean; mode: "smtp" | "log" }>;
      if (!json || typeof json !== "object") {
        setEmailError({ message: "Ungültige Serverantwort." });
        setEmailSending(false);
        return;
      }

      if (!json.ok) {
        setEmailError({
          message: json.error?.message || "Konnte E-Mail nicht senden.",
          code: json.error?.code,
          traceId: json.traceId,
        });
        setEmailSending(false);
        return;
      }

      setEmailResult(json.data);
      setEmailSending(false);
    } catch {
      setEmailError({ message: "Konnte E-Mail nicht senden. Bitte erneut versuchen." });
      setEmailSending(false);
    }
  }, [detail, emailSending, emailTo, emailSubject, emailMessage, emailIncludeValues, emailIncludePdf]);

  return (
    <div className="space-y-4">
      {/* Active Event Card (Info-only, nicht als Filter erzwungen) */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-900">Aktives Event (Mobile Erfassung)</div>
            <div className="mt-1 text-sm text-slate-600">
              {activeEvent?.name ? (
                <>
                  <span className="font-medium text-slate-900">{activeEvent.name}</span>{" "}
                  <span className="text-slate-500">(für Capture / Standardkontext)</span>
                </>
              ) : (
                <span className="text-slate-500">Kein aktives Event.</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/admin/events"
              className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200"
            >
              Events öffnen
            </Link>
            <IconButton title="Aktualisieren" onClick={() => void refreshAll()} />
          </div>
        </div>
      </section>

      {/* Toolbar */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <StatusPills value={status} onChange={setStatus} />
            <Input value={q} onChange={setQ} placeholder="Suche (Name, Firma, E-Mail, Telefon)" />
            <Select value={sortOpt} onChange={(v) => setSortOpt(v as SortOpt)} ariaLabel="Sortierung">
              <option value="CREATED_DESC">Neueste zuerst</option>
              <option value="CREATED_ASC">Älteste zuerst</option>
              <option value="NAME_ASC">Name A–Z</option>
              <option value="NAME_DESC">Name Z–A</option>
            </Select>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="text-sm text-slate-600">{countLabel}</div>

            {selectedCount > 0 ? (
              <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                {selectedCount} ausgewählt
              </div>
            ) : null}

            <div className="flex flex-col items-end gap-1">
              <Button
                label={exportNavBusy ? "Exportiere…" : "Exportieren"}
                kind="secondary"
                onClick={goToExportsPrefilled}
                disabled={exportNavBusy}
                title="Exportiert aktuell gefilterte Leads."
              />
              <div className="text-[11px] text-slate-500">Exportiert aktuell gefilterte Leads</div>
            </div>

            {isDirtyFilters ? <Button label="Reset" kind="ghost" onClick={resetFilters} /> : null}

            <IconButton title="Neu laden" onClick={() => void loadList()} />
          </div>
        </div>
      </section>

      {/* List */}
      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-white">
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label="Alle auswählen"
                    checked={items.length > 0 && items.every((it) => selectedIds.has(it.id))}
                    onChange={() => toggleSelectAllOnPage()}
                  />
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">Kontakt</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">E-Mail / Telefon</th>
                <th className="hidden px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600 md:table-cell">Event</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">Status</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">Erfasst am</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">Info</th>
              </tr>
            </thead>

            <tbody>
              {loadingList ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-sm text-slate-600">
                    Lade…
                  </td>
                </tr>
              ) : listError ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6">
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                      <div className="text-sm font-medium text-rose-900">Fehler</div>
                      <div className="mt-1 text-sm text-rose-800">{listError.message}</div>
                      {listError.traceId ? (
                        <div className="mt-2 text-xs text-rose-700">Support-Code: {listError.traceId}</div>
                      ) : null}
                      <div className="mt-3">
                        <Button label="Erneut versuchen" kind="secondary" onClick={() => void loadList()} />
                      </div>
                    </div>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-sm text-slate-600">
                    Keine Leads gefunden.
                  </td>
                </tr>
              ) : (
                items.map((it) => {
                  const checked = selectedIds.has(it.id);

                  return (
                    <tr
                      key={it.id}
                      className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                      onClick={() => openDrawer(it.id)}
                    >
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label="Lead auswählen"
                          checked={checked}
                          onChange={() => toggleSelect(it.id)}
                        />
                      </td>

                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-slate-900">{it.contactName ?? "—"}</div>
                        <div className="text-xs text-slate-600">{it.company ?? "—"}</div>
                        {it.sourceDeviceName ? (
                          <div className="mt-1 text-[11px] text-slate-500">Quelle: {it.sourceDeviceName}</div>
                        ) : null}
                      </td>

                      <td className="px-4 py-3">
                        <div className="text-sm text-slate-900">{it.email ?? "—"}</div>
                        <div className="text-xs text-slate-600">{it.phone ?? "—"}</div>
                      </td>

                      <td className="hidden px-4 py-3 md:table-cell">
                        <div className="text-sm text-slate-900">{it.event?.name ?? "—"}</div>
                      </td>

                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${statusPillClasses(it.reviewStatus)}`}>
                          {statusLabel(it.reviewStatus)}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-sm text-slate-700">{fmtDateTime(it.createdAt)}</td>

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {it.hasCardAttachment ? (
                            <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700">
                              Karte
                            </span>
                          ) : null}
                          {it.hasOcr ? (
                            <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700">
                              OCR
                            </span>
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

        {nextCursor ? (
          <div className="flex items-center justify-center p-4">
            <Button label={loadingMore ? "Lade…" : "Mehr laden"} kind="secondary" onClick={() => void loadMore()} disabled={loadingMore} />
          </div>
        ) : null}
      </section>

      {/* Drawer */}
      <DrawerShell open={drawerOpen} title={detail ? (detail.contact?.name ?? "Lead") : "Lead"} onClose={closeDrawer}>
        {loadingDetail ? (
          <div className="text-sm text-slate-600">Lade…</div>
        ) : drawerErr ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
            <div className="text-sm font-medium text-rose-900">Fehler</div>
            <div className="mt-1 text-sm text-rose-800">{errMessage(drawerErr)}</div>
            {errTraceId(drawerErr) ? (
              <div className="mt-2 text-xs text-rose-700">Support-Code: {errTraceId(drawerErr)}</div>
            ) : null}
            <div className="mt-3">
              {selectedId ? <Button label="Erneut versuchen" kind="secondary" onClick={() => void loadDetail(selectedId)} /> : null}
            </div>
          </div>
        ) : !detail ? (
          <div className="text-sm text-slate-600">Kein Lead ausgewählt.</div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-slate-500">
                Erfasst: <span className="font-medium text-slate-700">{fmtDateTime(detail.createdAt)}</span>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  label={detail.reviewStatus === "REVIEWED" ? "Als neu markieren" : "Als bearbeitet markieren"}
                  kind={detail.reviewStatus === "REVIEWED" ? "secondary" : "primary"}
                  onClick={() => void toggleReviewed()}
                />
                <Button
                  label={saving ? "Speichere…" : "Speichern"}
                  kind="secondary"
                  disabled={!isDirtyDetail || saving}
                  onClick={() => void saveDetail()}
                />
              </div>
            </div>

            <Card title="Kontakt">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Vorname" value={draftFirst} onChange={setDraftFirst} placeholder="Vorname" />
                <Field label="Nachname" value={draftLast} onChange={setDraftLast} placeholder="Nachname" />
                <div className="sm:col-span-2">
                  <Field label="Firma" value={draftCompany} onChange={setDraftCompany} placeholder="Firma" />
                </div>
                <Field label="E-Mail" value={draftEmail} onChange={setDraftEmail} placeholder="E-Mail" />
                <Field label="Telefon" value={draftPhone} onChange={setDraftPhone} placeholder="Telefon" />
                <div className="sm:col-span-2">
                  <Field label="Mobile" value={draftMobile} onChange={setDraftMobile} placeholder="Mobile" />
                </div>
              </div>

              <div className="mt-3 text-xs text-slate-500">
                Kontakt-Quelle: <span className="font-medium text-slate-700">{detail.contact?.source ?? "—"}</span> · aktualisiert:{" "}
                <span className="font-medium text-slate-700">{fmtDateTime(detail.contact?.updatedAt ?? null)}</span>
              </div>
            </Card>

            <Card title="Notizen">
              <TextArea
                label="Interne Notiz"
                value={draftNotes}
                onChange={setDraftNotes}
                placeholder="z.B. Danke, will Offerte; Nachfassen am Dienstag…"
              />
              <div className="mt-2 text-xs text-slate-500">Nur intern (nicht in der App sichtbar).</div>
            </Card>

            <Card title="Per E-Mail weiterleiten">
              <div className="space-y-3">
                <Field label="Empfänger E-Mail" value={emailTo} onChange={setEmailTo} placeholder="z.B. verkauf@firma.ch" />
                <Field label="Betreff" value={emailSubject} onChange={setEmailSubject} placeholder="Betreff" />

                <TextArea
                  label="Nachricht (optional)"
                  value={emailMessage}
                  onChange={setEmailMessage}
                  placeholder="Optionaler Text für den Empfänger…"
                />

                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={emailIncludeValues}
                    onChange={(e) => setEmailIncludeValues(e.target.checked)}
                  />
                  Lead-Felder (values) im E-Mail mitsenden
                </label>

                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => void sendLeadEmail()} disabled={emailSending} className={["inline-flex items-center justify-center rounded-xl px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-slate-200","bg-[color:var(--lr-accent)] text-white hover:opacity-90", emailSending ? "opacity-60 pointer-events-none" : ""].join(" ")}>{emailSending ? "Sende…" : "E-Mail senden"}</button>
                  </div>

                {emailError ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3">
                    <div className="text-sm font-medium text-rose-900">E-Mail Fehler</div>
                    <div className="mt-1 text-sm text-rose-800">{emailError.message}</div>
                    {emailError.traceId ? <div className="mt-2 text-xs text-rose-700">Support-Code: {emailError.traceId}</div> : null}
                  </div>
                ) : null}

                {emailResult ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
                    <div className="text-sm font-medium text-emerald-900">E-Mail versendet</div>
                    <div className="mt-1 text-sm text-emerald-800">
                      Status: {emailResult.delivered ? "OK" : "Unklar"} · Modus:{" "}
                      <span className="font-medium">{emailResult.mode}</span>
                    </div>
                  </div>
                ) : null}
              </div>
            </Card>

            <Card title="Quelle / Meta">
              <div className="space-y-1 text-sm text-slate-700">
                <div>
                  <span className="text-slate-500">Event:</span> {detail.event?.name ?? "—"}
                </div>
                <div>
                  <span className="text-slate-500">Formular:</span> {detail.form?.name ?? "—"}
                </div>
                <div>
                  <span className="text-slate-500">Device:</span> {detail.sourceDeviceName ?? "—"}
                </div>
                <div>
                  <span className="text-slate-500">Erfasst:</span> {fmtDateTime(detail.createdAt)}
                </div>
                <div>
                  <span className="text-slate-500">Status:</span>{" "}
                  <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${statusPillClasses(detail.reviewStatus)}`}>
                    {statusLabel(detail.reviewStatus)}
                  </span>
                </div>
              </div>
            </Card>

            <Card title="Anhänge / OCR">
              {pickBusinessCardAttachment ? (
                <div className="space-y-3">
                  <div className="text-sm text-slate-700">
                    <span className="text-slate-500">Business Card:</span> {pickBusinessCardAttachment.filename}
                  </div>

                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                    {String(pickBusinessCardAttachment.mimeType || "").toLowerCase().startsWith("image/") ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          alt="Business Card"
                          className="h-auto w-full object-contain"
                          src={`/api/admin/v1/leads/${detail.id}/attachments/${pickBusinessCardAttachment.id}/download?disposition=inline`}
                        />
                      </>
                    ) : (
                      <div className="p-4 text-sm text-slate-600">Vorschau nicht verfügbar.</div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200"
                      href={`/api/admin/v1/leads/${detail.id}/attachments/${pickBusinessCardAttachment.id}/download?disposition=attachment`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Download
                    </a>

                    <Button label={ocrLoading ? "OCR lade…" : "OCR laden"} kind="secondary" onClick={() => void loadOcr()} disabled={ocrLoading} />
                    <Button
                      label={ocrApplying ? "Wende an…" : "OCR anwenden"}
                      kind="secondary"
                      onClick={() => void applyOcr()}
                      disabled={!ocrData?.ocr?.id || ocrApplying}
                      title={!ocrData?.ocr?.id ? "Zuerst OCR laden." : undefined}
                    />
                  </div>

                  {ocrError ? (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3">
                      <div className="text-sm font-medium text-rose-900">OCR Fehler</div>
                      <div className="mt-1 text-sm text-rose-800">{ocrError.message}</div>
                      {ocrError.traceId ? <div className="mt-2 text-xs text-rose-700">Support-Code: {ocrError.traceId}</div> : null}
                    </div>
                  ) : null}

                  {ocrData?.ocr ? (
                    <div className="rounded-2xl border border-slate-200 bg-white p-3">
                      <div className="text-sm font-medium text-slate-900">OCR Summary</div>
                      <div className="mt-1 text-sm text-slate-700">
                        Status: <span className="font-medium">{ocrData.ocr.status}</span> · Engine:{" "}
                        <span className="font-medium">{ocrData.ocr.engine}</span>
                        {typeof ocrData.ocr.confidence === "number" ? (
                          <>
                            {" "}
                            · Confidence: <span className="font-medium">{Math.round(ocrData.ocr.confidence * 100)}%</span>
                          </>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="text-sm text-slate-600">Keine Anhänge vorhanden.</div>
              )}
            </Card>

            {drawerErr ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                <div className="text-sm font-medium text-rose-900">Fehler</div>
                <div className="mt-1 text-sm text-rose-800">{errMessage(drawerErr)}</div>
                {errTraceId(drawerErr) ? <div className="mt-2 text-xs text-rose-700">Support-Code: {errTraceId(drawerErr)}</div> : null}
              </div>
            ) : null}
          </div>
        )}
      </DrawerShell>
    </div>
  );
}
