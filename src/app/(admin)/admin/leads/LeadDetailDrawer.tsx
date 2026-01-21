"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { adminFetchJson as _adminFetchJson } from "../_lib/adminFetch";
import type { AdminFormListItem, AdminLeadDetail, ApiResponse } from "./leads.types";

type AdminFetchJsonFn = <T = unknown>(path: string, init?: RequestInit) => Promise<T>;
const adminFetchJson = _adminFetchJson as unknown as AdminFetchJsonFn;

function formatBytes(n?: number | null): string {
  if (!n || n <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function pickString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function pickNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) {
    const allPrimitive = v.every((x) => ["string", "number", "boolean"].includes(typeof x) || x === null);
    if (allPrimitive) return v.map((x) => (x === null ? "" : String(x))).filter(Boolean).join(", ");
    try {
      return JSON.stringify(v, null, 2);
    } catch {
      return String(v);
    }
  }
  if (isPlainObject(v)) {
    try {
      return JSON.stringify(v, null, 2);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

function isImageAttachment(a: { type?: string; mimeType?: string | null }): boolean {
  const t = String(a.type || "").toUpperCase();
  const m = String(a.mimeType || "").toLowerCase();
  if (m.startsWith("image/")) return true;
  return t === "BUSINESS_CARD_IMAGE" || t === "IMAGE";
}

function pillClass(kind: "neutral" | "good" | "warn" | "bad"): string {
  if (kind === "good") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (kind === "warn") return "border-amber-200 bg-amber-50 text-amber-900";
  if (kind === "bad") return "border-red-200 bg-red-50 text-red-800";
  return "border-black/10 bg-black/5 text-black/70";
}

type LeadAttachmentListItem = {
  id: string;
  type?: string;
  filename?: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
};

type LeadContactView = {
  contactFirstName?: string | null;
  contactLastName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  contactMobile?: string | null;
  contactCompany?: string | null;
  contactTitle?: string | null;
  contactWebsite?: string | null;
  contactStreet?: string | null;
  contactZip?: string | null;
  contactCity?: string | null;
  contactCountry?: string | null;
  contactSource?: string | null;
  contactUpdatedAt?: string | null;
  contactOcrResultId?: string | null;
};

type OcrContact = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
  company?: string | null;
  title?: string | null;
  website?: string | null;
  street?: string | null;
  zip?: string | null;
  city?: string | null;
  country?: string | null;
};

type OcrResult = {
  id: string;
  kind?: string | null;
  mode?: string | null;
  status?: string | null;
  engine?: string | null;
  engineVersion?: string | null;
  languageHint?: string | null;

  rawText?: string | null;
  confidence?: number | null;

  parsedContact?: OcrContact | null;
  correctedContact?: OcrContact | null;

  correctedAt?: string | null;
  correctedByUserId?: string | null;

  completedAt?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  updatedAt?: string | null;
  createdAt?: string | null;
};

type OcrPanelData = {
  attachment: LeadAttachmentListItem | null;
  ocr: OcrResult | null;
};

function normalizeOcrContact(v: unknown): OcrContact | null {
  if (!isPlainObject(v)) return null;
  const o = v;
  return {
    firstName: pickString(o.firstName) ?? null,
    lastName: pickString(o.lastName) ?? null,
    email: pickString(o.email) ?? null,
    phone: pickString(o.phone) ?? null,
    mobile: pickString(o.mobile) ?? null,
    company: pickString(o.company) ?? null,
    title: pickString(o.title) ?? null,
    website: pickString(o.website) ?? null,
    street: pickString(o.street) ?? null,
    zip: pickString(o.zip) ?? null,
    city: pickString(o.city) ?? null,
    country: pickString(o.country) ?? null,
  };
}

function normalizeOcrResult(v: unknown): OcrResult | null {
  if (!isPlainObject(v)) return null;
  const o = v;

  const id = pickString(o.id);
  if (!id) return null;

  const parsed =
    normalizeOcrContact(o.parsedContactJson) ??
    normalizeOcrContact(o.parsedContact) ??
    normalizeOcrContact(o.parsedContactJSON) ??
    normalizeOcrContact(o.parsed);

  const corrected = normalizeOcrContact(o.correctedContactJson) ?? normalizeOcrContact(o.correctedContact);

  return {
    id,
    kind: pickString(o.kind),
    mode: pickString(o.mode),
    status: pickString(o.status),
    engine: pickString(o.engine),
    engineVersion: pickString(o.engineVersion),
    languageHint: pickString(o.languageHint),

    rawText: pickString(o.rawText),
    confidence: pickNumber(o.confidence),

    parsedContact: parsed,
    correctedContact: corrected,

    correctedAt: pickString(o.correctedAt),
    correctedByUserId: pickString(o.correctedByUserId),

    completedAt: pickString(o.completedAt),
    errorCode: pickString(o.errorCode),
    errorMessage: pickString(o.errorMessage),
    updatedAt: pickString(o.updatedAt),
    createdAt: pickString(o.createdAt),
  };
}

function normalizeOcrPanelData(payload: unknown, fallbackAttachment: LeadAttachmentListItem | null): OcrPanelData {
  if (!isPlainObject(payload)) return { attachment: fallbackAttachment, ocr: null };

  // Preferred shape: { attachment, ocr }
  const attRaw = payload.attachment;
  const ocrRaw = payload.ocr;

  const attachment: LeadAttachmentListItem | null = isPlainObject(attRaw)
    ? {
        id: pickString(attRaw.id) ?? (fallbackAttachment?.id ?? ""),
        type: pickString(attRaw.type) ?? fallbackAttachment?.type,
        filename: pickString(attRaw.filename) ?? fallbackAttachment?.filename,
        mimeType: pickString(attRaw.mimeType) ?? fallbackAttachment?.mimeType ?? null,
        sizeBytes: pickNumber(attRaw.sizeBytes) ?? fallbackAttachment?.sizeBytes ?? null,
      }
    : fallbackAttachment;

  const ocr = normalizeOcrResult(ocrRaw) ?? normalizeOcrResult(payload);

  return { attachment, ocr };
}

function contactFromLead(lead: AdminLeadDetail | null): LeadContactView {
  return (lead ?? ({} as AdminLeadDetail)) as unknown as LeadContactView;
}

function ocrStatusPill(status?: string | null): { label: string; kind: "neutral" | "good" | "warn" | "bad" } {
  const s = String(status || "").toUpperCase();
  if (s === "COMPLETED") return { label: "Completed", kind: "good" };
  if (s === "PENDING") return { label: "Pending", kind: "warn" };
  if (s === "FAILED") return { label: "Failed", kind: "bad" };
  if (!s) return { label: "—", kind: "neutral" };
  return { label: s, kind: "neutral" };
}

function compactDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function toInput(v: string | null | undefined): string {
  return (v ?? "").toString();
}

function sanitizeDraft(d: OcrContact): OcrContact {
  const clean = (s: unknown) => {
    const t = typeof s === "string" ? s.trim() : "";
    return t.length ? t : null;
  };
  return {
    firstName: clean(d.firstName),
    lastName: clean(d.lastName),
    email: clean(d.email),
    phone: clean(d.phone),
    mobile: clean(d.mobile),
    company: clean(d.company),
    title: clean(d.title),
    website: clean(d.website),
    street: clean(d.street),
    zip: clean(d.zip),
    city: clean(d.city),
    country: clean(d.country),
  };
}

export default function LeadDetailDrawer(props: {
  open: boolean;
  leadId: string | null;
  onClose: () => void;
  formsById: Map<string, AdminFormListItem>;
  formatCapturedAt: (iso: string) => string;
  onMutated: (leadId: string) => void;
}) {
  const { open, leadId, onClose, formsById, formatCapturedAt, onMutated } = props;

  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [lead, setLead] = useState<AdminLeadDetail | null>(null);
  const [traceId, setTraceId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");

  // OCR panel state
  const [ocrState, setOcrState] = useState<"idle" | "loading" | "error">("idle");
  const [ocrPanel, setOcrPanel] = useState<OcrPanelData>({ attachment: null, ocr: null });
  const [ocrTraceId, setOcrTraceId] = useState<string | null>(null);
  const [ocrErrorMessage, setOcrErrorMessage] = useState<string>("");

  const [correctionDraft, setCorrectionDraft] = useState<OcrContact>({
    firstName: null,
    lastName: null,
    email: null,
    phone: null,
    mobile: null,
    company: null,
    title: null,
    website: null,
    street: null,
    zip: null,
    city: null,
    country: null,
  });

  const [rawExpanded, setRawExpanded] = useState<boolean>(false);

  const formName = useMemo(() => {
    if (!lead) return null;
    return formsById.get(lead.formId)?.name ?? lead.formId;
  }, [formsById, lead]);

  const leadAttachments = useMemo(() => {
    const raw = (lead as unknown as { attachments?: unknown })?.attachments;
    if (!Array.isArray(raw)) return [];
    return raw.filter((x) => isPlainObject(x)).map((x) => x as unknown as LeadAttachmentListItem);
  }, [lead]);

  const businessCardAttachment = useMemo(() => {
    const items = leadAttachments;
    const pick = items.find((a) => String(a.type || "").toUpperCase() === "BUSINESS_CARD_IMAGE");
    if (pick) return pick;

    // fallback: any image attachment if no explicit BUSINESS_CARD_IMAGE
    const img = items.find((a) => isImageAttachment(a));
    return img ?? null;
  }, [leadAttachments]);

  const resetLocalErrors = useCallback(() => {
    setErrorMessage("");
    setTraceId(null);
  }, []);

  const resetOcrErrors = useCallback(() => {
    setOcrErrorMessage("");
    setOcrTraceId(null);
  }, []);

  const loadDetail = useCallback(async () => {
    if (!leadId) return;

    setState("loading");
    resetLocalErrors();

    try {
      const res = (await adminFetchJson<ApiResponse<AdminLeadDetail>>(`/api/admin/v1/leads/${leadId}`, {
        method: "GET",
      })) as ApiResponse<AdminLeadDetail>;

      if (!res.ok) {
        setState("error");
        setTraceId(res.traceId ?? null);
        setErrorMessage(res.error?.message || "Failed to load lead detail.");
        return;
      }

      setLead(res.data);
      setState("idle");
    } catch (e) {
      setState("error");
      setErrorMessage(e instanceof Error ? e.message : "Failed to load lead detail.");
    }
  }, [leadId, resetLocalErrors]);

  const loadOcr = useCallback(
    async (attachmentFallback: LeadAttachmentListItem | null) => {
      if (!leadId) return;

      setOcrState("loading");
      resetOcrErrors();

      try {
        const res = (await adminFetchJson<ApiResponse<unknown>>(`/api/admin/v1/leads/${leadId}/ocr`, {
          method: "GET",
        })) as ApiResponse<unknown>;

        if (!res.ok) {
          setOcrState("error");
          setOcrTraceId(res.traceId ?? null);
          setOcrErrorMessage(res.error?.message || "Failed to load OCR.");
          setOcrPanel({ attachment: attachmentFallback, ocr: null });
          return;
        }

        const normalized = normalizeOcrPanelData(res.data, attachmentFallback);
        setOcrPanel(normalized);

        const effective = normalized.ocr?.correctedContact ?? normalized.ocr?.parsedContact ?? null;
        if (effective) setCorrectionDraft({ ...effective });
        else {
          setCorrectionDraft({
            firstName: null,
            lastName: null,
            email: null,
            phone: null,
            mobile: null,
            company: null,
            title: null,
            website: null,
            street: null,
            zip: null,
            city: null,
            country: null,
          });
        }

        setOcrState("idle");
      } catch (e) {
        setOcrState("error");
        setOcrErrorMessage(e instanceof Error ? e.message : "Failed to load OCR.");
        setOcrPanel({ attachment: attachmentFallback, ocr: null });
      }
    },
    [leadId, resetOcrErrors]
  );

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      void loadDetail();
    }, 0);
    return () => clearTimeout(t);
  }, [open, loadDetail]);

  useEffect(() => {
    if (!open) return;
    if (!leadId) return;
    if (!lead) return;

    const fallback = businessCardAttachment;
    if (!fallback) {
      const t = setTimeout(() => {
        setTimeout(() => {
        setOcrPanel({ attachment: null, ocr: null });
        setOcrState("idle");
      }, 0);
      }, 0);
      return () => clearTimeout(t);
    }

    void loadOcr(fallback);
  }, [open, leadId, lead, businessCardAttachment, loadOcr]);

const doDelete = useCallback(async () => {
    if (!leadId) return;
    const ok = window.confirm("Soft-delete this lead? (You can restore only if restore is enabled.)");
    if (!ok) return;

    resetLocalErrors();

    try {
      const res = (await adminFetchJson<ApiResponse<{ id: string } | AdminLeadDetail>>(`/api/admin/v1/leads/${leadId}`, {
        method: "DELETE",
      })) as ApiResponse<{ id: string } | AdminLeadDetail>;

      if (!res.ok) {
        setTraceId(res.traceId ?? null);
        setErrorMessage(res.error?.message || "Delete failed.");
        return;
      }

      setLead((prev) => (prev ? { ...prev, isDeleted: true } : prev));
      onMutated(leadId);
      void loadDetail();
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "Delete failed.");
    }
  }, [leadId, loadDetail, onMutated, resetLocalErrors]);

  const doRestore = useCallback(async () => {
    if (!leadId) return;
    const ok = window.confirm("Restore this lead?");
    if (!ok) return;

    resetLocalErrors();

    try {
      const res = (await adminFetchJson<ApiResponse<{ id: string } | AdminLeadDetail>>(
        `/api/admin/v1/leads/${leadId}/restore`,
        { method: "POST" }
      )) as ApiResponse<{ id: string } | AdminLeadDetail>;

      if (!res.ok) {
        setTraceId(res.traceId ?? null);
        setErrorMessage(
          res.error?.code === "NOT_FOUND"
            ? "Restore is not available yet in this environment."
            : res.error?.message || "Restore failed."
        );
        return;
      }

      setLead((prev) => (prev ? { ...prev, isDeleted: false } : prev));
      onMutated(leadId);
      void loadDetail();
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "Restore failed.");
    }
  }, [leadId, loadDetail, onMutated, resetLocalErrors]);

  const doSaveCorrection = useCallback(async () => {
    if (!leadId) return;

    const ocrId = ocrPanel.ocr?.id ?? null;
    if (!ocrId) {
      setOcrErrorMessage("No OCR result to correct.");
      return;
    }

    resetOcrErrors();

    try {
      const body = {
        ocrResultId: ocrId,
        correctedContact: sanitizeDraft(correctionDraft),
      };

      const res = (await adminFetchJson<ApiResponse<unknown>>(`/api/admin/v1/leads/${leadId}/ocr`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })) as ApiResponse<unknown>;

      if (!res.ok) {
        setOcrTraceId(res.traceId ?? null);
        setOcrErrorMessage(res.error?.message || "Save correction failed.");
        return;
      }

      await loadOcr(businessCardAttachment);
    } catch (e) {
      setOcrErrorMessage(e instanceof Error ? e.message : "Save correction failed.");
    }
  }, [leadId, ocrPanel.ocr?.id, correctionDraft, loadOcr, businessCardAttachment, resetOcrErrors]);

  const doApplyOcrToContact = useCallback(async () => {
    if (!leadId) return;

    const ocrId = ocrPanel.ocr?.id ?? null;
    if (!ocrId) {
      setOcrErrorMessage("No OCR result available to apply.");
      return;
    }

    const ok = window.confirm("Apply OCR contact to this lead (contact_*)?");
    if (!ok) return;

    resetOcrErrors();
    resetLocalErrors();

    try {
      const res = (await adminFetchJson<ApiResponse<unknown>>(`/api/admin/v1/leads/${leadId}/ocr/apply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ocrResultId: ocrId }),
      })) as ApiResponse<unknown>;

      if (!res.ok) {
        setOcrTraceId(res.traceId ?? null);
        setOcrErrorMessage(res.error?.message || "Apply failed.");
        return;
      }

      onMutated(leadId);
      await loadDetail();
      await loadOcr(businessCardAttachment);
    } catch (e) {
      setOcrErrorMessage(e instanceof Error ? e.message : "Apply failed.");
    }
  }, [leadId, ocrPanel.ocr?.id, onMutated, loadDetail, loadOcr, businessCardAttachment, resetOcrErrors, resetLocalErrors]);

  const doResetDraft = useCallback(() => {
    const effective = ocrPanel.ocr?.correctedContact ?? ocrPanel.ocr?.parsedContact ?? null;
    if (effective) setCorrectionDraft({ ...effective });
    else {
      setCorrectionDraft({
        firstName: null,
        lastName: null,
        email: null,
        phone: null,
        mobile: null,
        company: null,
        title: null,
        website: null,
        street: null,
        zip: null,
        city: null,
        country: null,
      });
    }
  }, [ocrPanel.ocr?.correctedContact, ocrPanel.ocr?.parsedContact]);

  if (!open) return null;

  const leadContact = contactFromLead(lead);

  const contactPairs: Array<{ label: string; value: string }> = [
    { label: "First name", value: toInput(leadContact.contactFirstName) },
    { label: "Last name", value: toInput(leadContact.contactLastName) },
    { label: "Email", value: toInput(leadContact.contactEmail) },
    { label: "Phone", value: toInput(leadContact.contactPhone) },
    { label: "Mobile", value: toInput(leadContact.contactMobile) },
    { label: "Company", value: toInput(leadContact.contactCompany) },
    { label: "Title", value: toInput(leadContact.contactTitle) },
    { label: "Website", value: toInput(leadContact.contactWebsite) },
    { label: "Street", value: toInput(leadContact.contactStreet) },
    { label: "ZIP", value: toInput(leadContact.contactZip) },
    { label: "City", value: toInput(leadContact.contactCity) },
    { label: "Country", value: toInput(leadContact.contactCountry) },
  ];

  const ocr = ocrPanel.ocr;
  const ocrPill = ocrStatusPill(ocr?.status);
  const ocrHasAttachment = Boolean(ocrPanel.attachment?.id);
  const ocrAttachment = ocrPanel.attachment;

  const inlineUrl = leadId && ocrAttachment?.id ? `/api/admin/v1/leads/${leadId}/attachments/${ocrAttachment.id}/download?disposition=inline` : "#";
  const downloadUrl = leadId && ocrAttachment?.id ? `/api/admin/v1/leads/${leadId}/attachments/${ocrAttachment.id}/download` : "#";

  return (
    <div className="fixed inset-0 z-50">
      <button type="button" className="absolute inset-0 bg-black/30" onClick={onClose} aria-label="Close" />

      <div className="absolute right-0 top-0 h-full w-full max-w-xl overflow-y-auto bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">Lead</h2>
              {lead?.isDeleted ? (
                <span className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-medium ${pillClass("bad")}`}>
                  Deleted
                </span>
              ) : (
                <span className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-medium ${pillClass("neutral")}`}>
                  Active
                </span>
              )}
            </div>
            <div className="mt-1 text-sm text-black/60">
              {lead?.capturedAt ? formatCapturedAt(lead.capturedAt) : "—"}
              {lead?.formId ? (
                <>
                  {" · "}
                  <span className="font-medium text-black/75">{formName}</span>
                </>
              ) : null}
            </div>
            {leadId && <div className="mt-1 truncate text-xs text-black/40">id: {leadId}</div>}
          </div>

          <button type="button" className="rounded-md border px-3 py-1.5 text-sm hover:bg-black/5" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="px-5 py-4">
          {state === "loading" && <DetailSkeleton />}

          {state === "error" && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <div className="font-semibold text-red-800">Could not load lead.</div>
              <div className="mt-1 text-sm text-red-800/80">{errorMessage || "Something went wrong."}</div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm hover:bg-white/60"
                  onClick={() => void loadDetail()}
                >
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
          )}

          {state === "idle" && lead && (
            <>
              {(errorMessage || traceId) && (
                <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <div className="font-medium text-amber-900">Action issue</div>
                  <div className="mt-1 text-sm text-amber-900/80">{errorMessage}</div>
                  {traceId && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-amber-900/70">traceId: {traceId}</span>
                      <button
                        type="button"
                        className="rounded-md border border-amber-200 bg-white px-2 py-1 text-xs hover:bg-white/60"
                        onClick={() => void navigator.clipboard.writeText(traceId)}
                      >
                        Copy
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="mb-5 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-100"
                  onClick={() => void doDelete()}
                  disabled={lead.isDeleted}
                  title={lead.isDeleted ? "Already deleted" : "Soft-delete"}
                >
                  Delete
                </button>

                <button
                  type="button"
                  className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-black/5 disabled:opacity-50"
                  onClick={() => void doRestore()}
                  disabled={!lead.isDeleted}
                  title={!lead.isDeleted ? "Only available for deleted leads" : "Restore (if enabled)"}
                >
                  Restore
                </button>

                <div className="text-xs text-black/40">Restore is optional (depends on API availability).</div>
              </div>

              <section className="rounded-xl border bg-white p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Values</h3>
                  <span className="text-xs text-black/50">
                    {lead.values && typeof lead.values === "object" ? Object.keys(lead.values).length : 0} fields
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {lead.values && typeof lead.values === "object" && Object.keys(lead.values).length > 0 ? (
                    Object.keys(lead.values)
                      .sort((a, b) => a.localeCompare(b))
                      .map((k) => {
                        const v = (lead.values as Record<string, unknown>)[k];
                        const text = formatValue(v);
                        return (
                          <div key={k} className="grid grid-cols-12 gap-3 border-b pb-3 last:border-b-0 last:pb-0">
                            <div className="col-span-4 text-sm font-medium text-black/70">
                              <div className="break-words">{k}</div>
                            </div>
                            <div className="col-span-8">
                              {text.includes("\n") ? (
                                <pre className="whitespace-pre-wrap break-words rounded-md bg-black/[0.03] p-2 text-sm text-black/80">
                                  {text}
                                </pre>
                              ) : (
                                <div className="break-words text-sm text-black/80">{text || "—"}</div>
                              )}
                            </div>
                          </div>
                        );
                      })
                  ) : (
                    <div className="text-sm text-black/60">No values.</div>
                  )}
                </div>
              </section>

              <section className="mt-4 rounded-xl border bg-white p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Contact</h3>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-medium ${pillClass("neutral")}`}>
                      source: {leadContact.contactSource ? String(leadContact.contactSource) : "—"}
                    </span>
                    <span className="text-xs text-black/50">updated: {compactDate(leadContact.contactUpdatedAt)}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {contactPairs.map((p) => (
                    <div key={p.label} className="grid grid-cols-12 gap-3 border-b pb-3 last:border-b-0 last:pb-0">
                      <div className="col-span-4 text-sm font-medium text-black/70">{p.label}</div>
                      <div className="col-span-8 break-words text-sm text-black/80">{p.value || "—"}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-3 text-xs text-black/40">
                  Contact fields are exported as contact_* (stable columns).
                </div>
              </section>

              <section className="mt-4 rounded-xl border bg-white p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold">OCR (Business Card)</h3>
                      <span className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-medium ${pillClass(ocrPill.kind)}`}>
                        {ocrPill.label}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-black/50">
                      engine: {ocr?.engine || "—"} {ocr?.engineVersion ? `· ${ocr.engineVersion}` : ""} {ocr?.mode ? `· ${ocr.mode}` : ""}
                      {typeof ocr?.confidence === "number" ? ` · conf ${Math.round(ocr.confidence * 100)}%` : ""}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      className="rounded-md border px-3 py-1.5 text-sm hover:bg-black/5 disabled:opacity-50"
                      onClick={() => void loadOcr(businessCardAttachment)}
                      disabled={!ocrHasAttachment || ocrState === "loading"}
                      title={!ocrHasAttachment ? "No business card attachment available" : "Reload OCR"}
                    >
                      Reload
                    </button>

                    <button
                      type="button"
                      className="rounded-md border border-black/10 bg-black text-white px-3 py-1.5 text-sm hover:bg-black/90 disabled:opacity-50"
                      onClick={() => void doApplyOcrToContact()}
                      disabled={!ocr?.id || String(ocr?.status || "").toUpperCase() !== "COMPLETED"}
                      title={!ocr?.id ? "No OCR result" : String(ocr?.status || "").toUpperCase() !== "COMPLETED" ? "OCR must be completed" : "Apply to lead contact"}
                    >
                      Apply
                    </button>
                  </div>
                </div>

                {(ocrErrorMessage || ocrTraceId) && (
                  <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <div className="text-sm font-medium text-amber-900">OCR issue</div>
                    <div className="mt-1 text-sm text-amber-900/80">{ocrErrorMessage || "Something went wrong."}</div>
                    {ocrTraceId && (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-xs text-amber-900/70">traceId: {ocrTraceId}</span>
                        <button
                          type="button"
                          className="rounded-md border border-amber-200 bg-white px-2 py-1 text-xs hover:bg-white/60"
                          onClick={() => void navigator.clipboard.writeText(ocrTraceId)}
                        >
                          Copy
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {!ocrHasAttachment ? (
                  <div className="text-sm text-black/60">No business card image attachment found for this lead.</div>
                ) : (
                  <div className="grid grid-cols-12 gap-4">
                    <div className="col-span-5">
                      <div className="rounded-lg border bg-black/[0.02] p-2">
                        <div className="flex items-center justify-between">
                          <div className="text-xs font-medium text-black/70">Attachment</div>
                          <a href={downloadUrl} className="text-xs text-black/60 underline hover:text-black">
                            Download
                          </a>
                        </div>
                        <div className="mt-2 overflow-hidden rounded-md border bg-white">
                          <Image
                            src={inlineUrl}
                            alt={ocrAttachment?.filename || "business card"}
                            width={400}
                            height={240}
                            className="h-auto w-full object-contain"
                            unoptimized
                          />
                        </div>
                        <div className="mt-2 text-xs text-black/50">
                          {ocrAttachment?.filename || "—"}
                          {ocrAttachment?.mimeType ? ` · ${ocrAttachment.mimeType}` : ""}
                          {typeof ocrAttachment?.sizeBytes === "number" ? ` · ${formatBytes(ocrAttachment.sizeBytes)}` : ""}
                        </div>
                      </div>

                      <div className="mt-3 rounded-lg border bg-white p-3">
                        <div className="flex items-center justify-between">
                          <div className="text-xs font-medium text-black/70">Raw text</div>
                          <button
                            type="button"
                            className="text-xs text-black/60 underline hover:text-black"
                            onClick={() => setRawExpanded((v) => !v)}
                            disabled={!ocr?.rawText}
                          >
                            {rawExpanded ? "Collapse" : "Expand"}
                          </button>
                        </div>
                        {ocrState === "loading" ? (
                          <div className="mt-2 text-sm text-black/50">Loading…</div>
                        ) : ocr?.rawText ? (
                          <pre
                            className={`mt-2 whitespace-pre-wrap break-words rounded-md bg-black/[0.03] p-2 text-xs text-black/80 ${
                              rawExpanded ? "" : "max-h-40 overflow-hidden"
                            }`}
                          >
                            {ocr.rawText}
                          </pre>
                        ) : (
                          <div className="mt-2 text-sm text-black/50">No raw text.</div>
                        )}

                        <div className="mt-2 text-xs text-black/40">
                          created: {compactDate(ocr?.createdAt)} · updated: {compactDate(ocr?.updatedAt)} · completed: {compactDate(ocr?.completedAt)}
                        </div>
                        {ocr?.errorCode || ocr?.errorMessage ? (
                          <div className="mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800">
                            {ocr?.errorCode ? <span className="font-medium">{ocr.errorCode}</span> : null}
                            {ocr?.errorMessage ? <span>{ocr?.errorCode ? ` · ${ocr.errorMessage}` : ocr.errorMessage}</span> : null}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="col-span-7">
                      <div className="rounded-lg border bg-white p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-xs font-medium text-black/70">Parsed / corrected contact</div>
                            <div className="mt-1 text-xs text-black/50">
                              Uses correctedContact if present; otherwise parsedContact.
                            </div>
                          </div>

                          <div className="flex shrink-0 items-center gap-2">
                            <button
                              type="button"
                              className="rounded-md border px-2 py-1 text-xs hover:bg-black/5 disabled:opacity-50"
                              onClick={() => doResetDraft()}
                              disabled={!ocr?.id}
                            >
                              Reset
                            </button>
                            <button
                              type="button"
                              className="rounded-md border px-2 py-1 text-xs hover:bg-black/5 disabled:opacity-50"
                              onClick={() => void doSaveCorrection()}
                              disabled={!ocr?.id}
                            >
                              Save
                            </button>
                          </div>
                        </div>

                        <div className="mt-3 grid grid-cols-1 gap-2">
                          <ContactInput label="First name" value={toInput(correctionDraft.firstName)} onChange={(v) => setCorrectionDraft((p) => ({ ...p, firstName: v }))} />
                          <ContactInput label="Last name" value={toInput(correctionDraft.lastName)} onChange={(v) => setCorrectionDraft((p) => ({ ...p, lastName: v }))} />
                          <ContactInput label="Email" value={toInput(correctionDraft.email)} onChange={(v) => setCorrectionDraft((p) => ({ ...p, email: v }))} />
                          <ContactInput label="Phone" value={toInput(correctionDraft.phone)} onChange={(v) => setCorrectionDraft((p) => ({ ...p, phone: v }))} />
                          <ContactInput label="Mobile" value={toInput(correctionDraft.mobile)} onChange={(v) => setCorrectionDraft((p) => ({ ...p, mobile: v }))} />
                          <ContactInput label="Company" value={toInput(correctionDraft.company)} onChange={(v) => setCorrectionDraft((p) => ({ ...p, company: v }))} />
                          <ContactInput label="Title" value={toInput(correctionDraft.title)} onChange={(v) => setCorrectionDraft((p) => ({ ...p, title: v }))} />
                          <ContactInput label="Website" value={toInput(correctionDraft.website)} onChange={(v) => setCorrectionDraft((p) => ({ ...p, website: v }))} />
                          <ContactInput label="Street" value={toInput(correctionDraft.street)} onChange={(v) => setCorrectionDraft((p) => ({ ...p, street: v }))} />
                          <div className="grid grid-cols-2 gap-2">
                            <ContactInput label="ZIP" value={toInput(correctionDraft.zip)} onChange={(v) => setCorrectionDraft((p) => ({ ...p, zip: v }))} />
                            <ContactInput label="City" value={toInput(correctionDraft.city)} onChange={(v) => setCorrectionDraft((p) => ({ ...p, city: v }))} />
                          </div>
                          <ContactInput label="Country" value={toInput(correctionDraft.country)} onChange={(v) => setCorrectionDraft((p) => ({ ...p, country: v }))} />
                        </div>

                        <div className="mt-3 text-xs text-black/40">
                          Save stores correctedContactJson. Apply writes lead.contact_* and ocr_* export meta.
                        </div>
                      </div>

                      {leadContact.contactOcrResultId ? (
                        <div className="mt-3 rounded-lg border bg-black/[0.02] p-3 text-xs text-black/60">
                          Applied OCR Result: <span className="font-mono">{leadContact.contactOcrResultId}</span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}
              </section>

              <section className="mt-4 rounded-xl border bg-white p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Attachments</h3>
                  <span className="text-xs text-black/50">{lead.attachments?.length ?? 0} file(s)</span>
                </div>

                {lead.attachments && lead.attachments.length > 0 ? (
                  <div className="space-y-2">
                    {lead.attachments.map((a) => {
                      const item = a as unknown as LeadAttachmentListItem;
                      const img = isImageAttachment(item);
                      const inlineUrl2 =
                        leadId ? `/api/admin/v1/leads/${leadId}/attachments/${item.id}/download?disposition=inline` : "#";
                      const downloadUrl2 = leadId ? `/api/admin/v1/leads/${leadId}/attachments/${item.id}/download` : "#";

                      return (
                        <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                          <div className="flex min-w-0 items-center gap-3">
                            {img ? (
                              <div className="h-16 w-16 overflow-hidden rounded-md border bg-black/[0.02]">
                                <Image
                                  src={inlineUrl2}
                                  alt={item.filename || "attachment"}
                                  width={64}
                                  height={64}
                                  className="h-16 w-16 object-cover"
                                  unoptimized
                                />
                              </div>
                            ) : (
                              <div className="flex h-16 w-16 items-center justify-center rounded-md border bg-black/[0.02] text-sm text-black/50">
                                FILE
                              </div>
                            )}

                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium">{item.filename}</div>
                              <div className="mt-0.5 text-xs text-black/50">
                                {item.type}
                                {item.mimeType ? ` · ${item.mimeType}` : ""}
                                {typeof item.sizeBytes === "number" ? ` · ${formatBytes(item.sizeBytes)}` : ""}
                              </div>
                            </div>
                          </div>

                          <a href={downloadUrl2} className="rounded-md border px-3 py-1.5 text-sm hover:bg-black/5">
                            Download
                          </a>
                        </div>
                      );
                    })}
                    <div className="text-xs text-black/40">
                      Thumbnails are served inline. Download uses Content-Disposition: attachment.
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-black/60">No attachments.</div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ContactInput(props: { label: string; value: string; onChange: (v: string) => void }) {
  const { label, value, onChange } = props;
  return (
    <label className="grid grid-cols-12 items-center gap-2">
      <div className="col-span-4 text-xs font-medium text-black/70">{label}</div>
      <input
        className="col-span-8 w-full rounded-md border px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-black/10"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="—"
      />
    </label>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-24 animate-pulse rounded-xl bg-black/10" />
      <div className="h-48 animate-pulse rounded-xl bg-black/10" />
      <div className="h-28 animate-pulse rounded-xl bg-black/10" />
    </div>
  );
}
