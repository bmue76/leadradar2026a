"use client";

import * as React from "react";
import { adminFetchJson, getTenantSlugClient, setTenantSlugClient } from "../../_lib/adminFetch";

type FormListItem = { id: string; name: string; description: string | null; status: string };

type FormField = {
  id: string;
  key: string;
  label: string;
  type: string;
  required: boolean;
  isActive: boolean;
  sortOrder: number;
  placeholder: string | null;
  helpText: string | null;
  config: unknown;
};

type FormDetail = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  fields: FormField[];
};

function fieldInputKind(t: string): "text" | "email" | "tel" | "textarea" {
  const tt = (t || "").toUpperCase();
  if (tt === "EMAIL") return "email";
  if (tt === "PHONE") return "tel";
  if (tt === "TEXTAREA") return "textarea";
  return "text";
}

function mkClientLeadId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `demo_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function fmtErr(e: { code: string; message: string; traceId?: string; status?: number }): string {
  const parts = [`${e.code}: ${e.message}`];
  if (typeof e.status === "number") parts.push(`HTTP ${e.status}`);
  if (e.traceId) parts.push(`trace ${e.traceId}`);
  return parts.join(" · ");
}

export default function CaptureClient() {
  const [tenantSlug, setTenantSlug] = React.useState<string>(() => {
    // Default slug (env) or localStorage value (if present)
    return getTenantSlugClient();
  });

  const [loadingForms, setLoadingForms] = React.useState(true);
  const [forms, setForms] = React.useState<FormListItem[]>([]);
  const [selectedFormId, setSelectedFormId] = React.useState<string>("");

  const [loadingDetail, setLoadingDetail] = React.useState(false);
  const [detail, setDetail] = React.useState<FormDetail | null>(null);

  const [values, setValues] = React.useState<Record<string, string>>({});
  const [submitting, setSubmitting] = React.useState(false);

  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<{ leadId: string; deduped: boolean } | null>(null);

  async function loadForms(opts?: { keepSelection?: boolean }) {
    setLoadingForms(true);
    setError(null);
    setSuccess(null);

    const res = await adminFetchJson<{ forms: FormListItem[] }>("/api/mobile/v1/forms", {
      method: "GET",
      tenantSlug: tenantSlug.trim() ? tenantSlug.trim() : undefined,
    });

    if (!res.ok) {
      setForms([]);
      setSelectedFormId("");
      setDetail(null);
      setValues({});
      setError(fmtErr(res));
      setLoadingForms(false);
      return;
    }

    const nextForms = res.data.forms;
    setForms(nextForms);

    const keep = opts?.keepSelection ?? false;
    const nextSelected =
      keep && selectedFormId && nextForms.some((f) => f.id === selectedFormId) ? selectedFormId : nextForms[0]?.id ?? "";

    setSelectedFormId(nextSelected);
    setLoadingForms(false);
  }

  async function loadDetail(formId: string) {
    if (!formId) {
      setDetail(null);
      setValues({});
      return;
    }

    setLoadingDetail(true);
    setError(null);
    setSuccess(null);

    const res = await adminFetchJson<FormDetail>(`/api/mobile/v1/forms/${formId}`, {
      method: "GET",
      tenantSlug: tenantSlug.trim() ? tenantSlug.trim() : undefined,
    });

    if (!res.ok) {
      setDetail(null);
      setValues({});
      setError(fmtErr(res));
      setLoadingDetail(false);
      return;
    }

    setDetail(res.data);

    // init / preserve values (no stale closure)
    setValues((prev) => {
      const next: Record<string, string> = { ...prev };
      for (const f of res.data.fields) {
        if (typeof next[f.key] !== "string") next[f.key] = "";
      }
      return next;
    });

    setLoadingDetail(false);
  }

  React.useEffect(() => {
    void loadForms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    void loadDetail(selectedFormId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFormId]);

  function onChangeValue(key: string, v: string) {
    setValues((prev) => ({ ...prev, [key]: v }));
  }

  function validateRequired(): string | null {
    if (!detail) return "No form selected.";
    for (const f of detail.fields) {
      if (!f.required) continue;
      const v = (values[f.key] ?? "").trim();
      if (!v) return `Pflichtfeld fehlt: ${f.label}`;
    }
    return null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const reqErr = validateRequired();
    if (reqErr) {
      setError(reqErr);
      return;
    }
    if (!detail) {
      setError("No form selected.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        formId: detail.id,
        clientLeadId: mkClientLeadId(),
        capturedAt: new Date().toISOString(),
        values: Object.fromEntries(detail.fields.map((f) => [f.key, (values[f.key] ?? "").trim()])),
        meta: { source: "demo-capture" },
      };

      const res = await adminFetchJson<{ leadId: string; deduped: boolean }>("/api/mobile/v1/leads", {
        method: "POST",
        tenantSlug: tenantSlug.trim() ? tenantSlug.trim() : undefined,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        setError(fmtErr(res));
        return;
      }

      setSuccess(res.data);

      // reset for next lead
      setValues((prev) => {
        const next = { ...prev };
        for (const f of detail.fields) next[f.key] = "";
        return next;
      });
    } finally {
      setSubmitting(false);
    }
  }

  function onSaveTenantSlug() {
    const s = tenantSlug.trim();
    setTenantSlugClient(s);
    void loadForms({ keepSelection: false });
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Demo Capture</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Interner Screen zum Generieren echter Leads (Mobile API v1) – damit /admin/leads und Exports “Content” haben.
        </p>
      </div>

      <div className="mb-4 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="mb-2 text-sm font-medium text-neutral-900">Tenant (optional, DEV Override)</div>
        <div className="flex items-center gap-2">
          <input
            className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm"
            value={tenantSlug}
            onChange={(e) => setTenantSlug(e.target.value)}
            placeholder="tenant slug (z.B. atlex)"
            disabled={submitting || loadingForms || loadingDetail}
          />
          <button
            type="button"
            onClick={onSaveTenantSlug}
            className="shrink-0 rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
            disabled={submitting || loadingForms || loadingDetail}
          >
            Apply
          </button>
        </div>
        <div className="mt-2 text-xs text-neutral-600">
          Leer lassen = Session-Tenant. Ausfüllen = sendet <span className="font-mono">x-tenant-slug</span>.
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium text-neutral-900">Form auswählen</div>
            <div className="text-xs text-neutral-600">Nur ACTIVE Forms werden angezeigt.</div>
          </div>

          <button
            type="button"
            onClick={() => void loadForms({ keepSelection: true })}
            className="rounded-xl border border-neutral-200 px-3 py-1.5 text-sm text-neutral-800 hover:bg-neutral-50 disabled:opacity-60"
            disabled={loadingForms || submitting}
            aria-label="Reload forms"
          >
            Reload
          </button>
        </div>

        {loadingForms ? (
          <div className="text-sm text-neutral-600">Loading forms…</div>
        ) : forms.length === 0 ? (
          <div className="text-sm text-neutral-600">
            Keine ACTIVE Forms gefunden. Aktiviere zuerst ein Formular unter /admin/forms.
          </div>
        ) : (
          <div className="mb-5">
            <select
              className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm"
              value={selectedFormId}
              onChange={(ev) => setSelectedFormId(ev.target.value)}
              disabled={submitting}
            >
              {forms.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>

            {detail?.description ? <div className="mt-2 text-xs text-neutral-600">{detail.description}</div> : null}
          </div>
        )}

        {loadingDetail ? (
          <div className="text-sm text-neutral-600">Loading form detail…</div>
        ) : detail ? (
          <form onSubmit={onSubmit} className="space-y-4">
            {detail.fields.map((f) => {
              const kind = fieldInputKind(f.type);
              const value = values[f.key] ?? "";
              const req = f.required ? " *" : "";

              return (
                <div key={f.id}>
                  <label className="mb-1 block text-sm font-medium text-neutral-900">
                    {f.label}
                    <span className="text-neutral-500">{req}</span>
                  </label>

                  {kind === "textarea" ? (
                    <textarea
                      className="min-h-[96px] w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm"
                      placeholder={f.placeholder ?? ""}
                      value={value}
                      onChange={(ev) => onChangeValue(f.key, ev.target.value)}
                      disabled={submitting}
                    />
                  ) : (
                    <input
                      className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm"
                      type={kind}
                      placeholder={f.placeholder ?? ""}
                      value={value}
                      onChange={(ev) => onChangeValue(f.key, ev.target.value)}
                      disabled={submitting}
                      autoComplete="off"
                    />
                  )}

                  {f.helpText ? <div className="mt-1 text-xs text-neutral-600">{f.helpText}</div> : null}
                </div>
              );
            })}

            {error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
            ) : null}

            {success ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                Saved ✅ LeadId: <span className="font-mono text-xs">{success.leadId}</span>{" "}
                {success.deduped ? "(deduped)" : ""}
                <div className="mt-1 text-xs text-emerald-900/80">
                  Check:{" "}
                  <a className="underline" href="/admin/leads">
                    /admin/leads
                  </a>{" "}
                  oder CSV Export unter{" "}
                  <a className="underline" href="/admin/exports">
                    /admin/exports
                  </a>
                  .
                </div>
              </div>
            ) : null}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="submit"
                className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
                disabled={submitting || !selectedFormId}
              >
                {submitting ? "Saving…" : "Lead speichern"}
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  );
}
