"use client";

import * as React from "react";
import { adminFetchJson, setTenantSlugClient, TENANT_SLUG_STORAGE_KEY } from "../../_lib/adminFetch";

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

type FormValue = string | boolean | string[];

const LS_DEV_MOBILE_KEY = "leadradar.devMobileApiKey";
const LS_LEGACY_MOBILE_KEY = "lr_demo_capture_mobile_api_key";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function readLocalStorage(key: string): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function writeLocalStorage(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    if (!value) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function getTenantOverrideClient(): string {
  return readLocalStorage(TENANT_SLUG_STORAGE_KEY).trim();
}

function setDevMobileApiKeyClient(v: string) {
  const s = v.trim();
  writeLocalStorage(LS_DEV_MOBILE_KEY, s);
  if (s) writeLocalStorage(LS_LEGACY_MOBILE_KEY, ""); // cleanup legacy if we have new
}

function getDevMobileApiKeyClient(): string {
  const primary = readLocalStorage(LS_DEV_MOBILE_KEY).trim();
  if (primary) return primary;
  const legacy = readLocalStorage(LS_LEGACY_MOBILE_KEY).trim();
  return legacy;
}

function parseFormsPayload(payload: unknown): FormListItem[] {
  if (Array.isArray(payload)) return payload as FormListItem[];
  if (!isRecord(payload)) return [];
  const formsA = payload.forms;
  if (Array.isArray(formsA)) return formsA as FormListItem[];
  const data = payload.data;
  if (isRecord(data) && Array.isArray(data.forms)) return data.forms as FormListItem[];
  return [];
}

function parseDetailPayload(payload: unknown): FormDetail | null {
  if (!isRecord(payload)) return null;
  const direct = payload;
  if (typeof direct.id === "string" && Array.isArray(direct.fields)) return direct as unknown as FormDetail;
  const data = payload.data;
  if (isRecord(data) && typeof data.id === "string" && Array.isArray(data.fields)) return data as unknown as FormDetail;
  return null;
}

function parseOptions(config: unknown): string[] {
  if (!isRecord(config)) return [];
  const opts = config.options;
  if (!Array.isArray(opts)) return [];
  return opts
    .map((x) => String(x))
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseCheckboxDefault(config: unknown): boolean {
  if (!isRecord(config)) return false;
  const v = config.defaultValue;
  if (typeof v === "boolean") return v;
  return Boolean(v);
}

function normalizeType(t: string): string {
  return String(t || "").toUpperCase();
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

function emptyValueForField(f: FormField): FormValue {
  const t = normalizeType(f.type);
  if (t === "CHECKBOX") return parseCheckboxDefault(f.config);
  if (t === "MULTI_SELECT") return [];
  return "";
}

function trimValue(v: FormValue): FormValue {
  if (typeof v === "string") return v.trim();
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  return v;
}

function buildMobileAuthHeaders(rawKey: string): Record<string, string> {
  const k = rawKey.trim();
  if (!k) return {};
  return { "x-api-key": k };
}

export default function CaptureClient() {
  const [tenantSlug, setTenantSlug] = React.useState<string>(""); // optional override only
  const [mobileApiKey, setMobileApiKey] = React.useState<string>("");

  const [loadingForms, setLoadingForms] = React.useState(false);
  const [forms, setForms] = React.useState<FormListItem[]>([]);
  const [selectedFormId, setSelectedFormId] = React.useState<string>("");

  const [loadingDetail, setLoadingDetail] = React.useState(false);
  const [detail, setDetail] = React.useState<FormDetail | null>(null);

  const [values, setValues] = React.useState<Record<string, FormValue>>({});
  const [submitting, setSubmitting] = React.useState(false);

  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<{ leadId: string; deduped: boolean } | null>(null);

  const keyMissing = !mobileApiKey.trim();

  async function loadForms(opts?: { keepSelection?: boolean; overrideKey?: string; overrideTenantSlug?: string }) {
    const key = (opts?.overrideKey ?? mobileApiKey).trim();
    const tSlug = (opts?.overrideTenantSlug ?? tenantSlug).trim();

    setLoadingForms(true);
    setError(null);
    setSuccess(null);

    if (!key) {
      setForms([]);
      setSelectedFormId("");
      setDetail(null);
      setValues({});
      setLoadingForms(false);
      return;
    }

    const res = await adminFetchJson<unknown>("/api/mobile/v1/forms", {
      method: "GET",
      tenantSlug: tSlug ? tSlug : undefined,
      headers: buildMobileAuthHeaders(key),
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

    const nextForms = parseFormsPayload(res.data);
    setForms(nextForms);

    const keep = opts?.keepSelection ?? false;
    const nextSelected =
      keep && selectedFormId && nextForms.some((f) => f.id === selectedFormId)
        ? selectedFormId
        : nextForms.length > 0
          ? nextForms[0].id
          : "";

    setSelectedFormId(nextSelected);
    setLoadingForms(false);
  }

  async function loadDetail(formId: string) {
    if (!formId) {
      setDetail(null);
      setValues({});
      return;
    }

    const key = mobileApiKey.trim();
    const tSlug = tenantSlug.trim();

    setLoadingDetail(true);
    setError(null);
    setSuccess(null);

    if (!key) {
      setDetail(null);
      setValues({});
      setLoadingDetail(false);
      return;
    }

    const res = await adminFetchJson<unknown>(`/api/mobile/v1/forms/${formId}`, {
      method: "GET",
      tenantSlug: tSlug ? tSlug : undefined,
      headers: buildMobileAuthHeaders(key),
    });

    if (!res.ok) {
      setDetail(null);
      setValues({});
      setError(fmtErr(res));
      setLoadingDetail(false);
      return;
    }

    const parsed = parseDetailPayload(res.data);
    if (!parsed) {
      setDetail(null);
      setValues({});
      setError("Unexpected response shape from /api/mobile/v1/forms/:id");
      setLoadingDetail(false);
      return;
    }

    setDetail(parsed);

    setValues((prev) => {
      const next: Record<string, FormValue> = { ...prev };
      for (const f of parsed.fields) {
        if (!(f.key in next)) next[f.key] = emptyValueForField(f);
      }
      for (const kk of Object.keys(next)) {
        if (!parsed.fields.some((f) => f.key === kk)) delete next[kk];
      }
      return next;
    });

    setLoadingDetail(false);
  }

  // Init: read localStorage + optional ?key=... (DEV), then load forms if we have a key.
  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const storedTenant = getTenantOverrideClient();
    if (storedTenant) setTenantSlug(storedTenant);

    const url = new URL(window.location.href);
    const qpKey = (url.searchParams.get("key") ?? "").trim();

    let initialKey = getDevMobileApiKeyClient();

    if (qpKey) {
      initialKey = qpKey;
      setDevMobileApiKeyClient(qpKey);

      url.searchParams.delete("key");
      window.history.replaceState({}, "", url.toString());
    }

    if (initialKey) {
      setMobileApiKey(initialKey);
      void loadForms({ keepSelection: false, overrideKey: initialKey, overrideTenantSlug: storedTenant });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    void loadDetail(selectedFormId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFormId]);

  function setValue(key: string, v: FormValue) {
    setValues((prev) => ({ ...prev, [key]: v }));
  }

  function validateRequired(): string | null {
    if (!detail) return "No form selected.";
    for (const f of detail.fields) {
      if (!f.required) continue;

      const t = normalizeType(f.type);
      const v = values[f.key];

      if (t === "CHECKBOX") {
        if (v !== true) return `Pflichtfeld fehlt: ${f.label}`;
        continue;
      }

      if (t === "MULTI_SELECT") {
        if (!Array.isArray(v) || v.length === 0) return `Pflichtfeld fehlt: ${f.label}`;
        continue;
      }

      const s = typeof v === "string" ? v.trim() : "";
      if (!s) return `Pflichtfeld fehlt: ${f.label}`;
    }
    return null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const key = mobileApiKey.trim();
    if (!key) {
      setError("Mobile API Key fehlt. Bitte unter “Mobile API Key (DEV)” setzen und Apply klicken.");
      return;
    }

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
      const payloadValues: Record<string, FormValue> = {};
      for (const f of detail.fields) {
        payloadValues[f.key] = trimValue(values[f.key] ?? emptyValueForField(f));
      }

      const payload = {
        formId: detail.id,
        clientLeadId: mkClientLeadId(),
        capturedAt: new Date().toISOString(),
        values: payloadValues,
        meta: { source: "demo-capture" },
      };

      const res = await adminFetchJson<{ leadId: string; deduped: boolean }>("/api/mobile/v1/leads", {
        method: "POST",
        tenantSlug: tenantSlug.trim() ? tenantSlug.trim() : undefined,
        headers: { "content-type": "application/json", ...buildMobileAuthHeaders(key) },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        setError(fmtErr(res));
        return;
      }

      setSuccess(res.data);

      setValues((prev) => {
        const next: Record<string, FormValue> = { ...prev };
        for (const f of detail.fields) next[f.key] = emptyValueForField(f);
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

  function onSaveMobileKey() {
    const s = mobileApiKey.trim();
    setDevMobileApiKeyClient(s);
    void loadForms({ keepSelection: false });
  }

  function renderField(f: FormField) {
    const t = normalizeType(f.type);
    const req = f.required ? " *" : "";
    const v = values[f.key] ?? emptyValueForField(f);

    if (t === "TEXTAREA") {
      return (
        <div key={f.id}>
          <label className="mb-1 block text-sm font-medium text-neutral-900">
            {f.label}
            <span className="text-neutral-500">{req}</span>
          </label>
          <textarea
            className="min-h-[96px] w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm"
            placeholder={f.placeholder ?? ""}
            value={typeof v === "string" ? v : ""}
            onChange={(ev) => setValue(f.key, ev.target.value)}
            disabled={submitting}
          />
          {f.helpText ? <div className="mt-1 text-xs text-neutral-600">{f.helpText}</div> : null}
        </div>
      );
    }

    if (t === "SINGLE_SELECT") {
      const opts = parseOptions(f.config);
      return (
        <div key={f.id}>
          <label className="mb-1 block text-sm font-medium text-neutral-900">
            {f.label}
            <span className="text-neutral-500">{req}</span>
          </label>
          <select
            className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm"
            value={typeof v === "string" ? v : ""}
            onChange={(ev) => setValue(f.key, ev.target.value)}
            disabled={submitting}
          >
            <option value="">—</option>
            {opts.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          {f.helpText ? <div className="mt-1 text-xs text-neutral-600">{f.helpText}</div> : null}
        </div>
      );
    }

    if (t === "MULTI_SELECT") {
      const opts = parseOptions(f.config);
      const vv = Array.isArray(v) ? v : [];
      return (
        <div key={f.id}>
          <label className="mb-1 block text-sm font-medium text-neutral-900">
            {f.label}
            <span className="text-neutral-500">{req}</span>
          </label>
          <select
            multiple
            className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm"
            value={vv}
            onChange={(ev) => {
              const selected = Array.from(ev.target.selectedOptions).map((o) => o.value);
              setValue(f.key, selected);
            }}
            disabled={submitting}
          >
            {opts.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          {f.helpText ? <div className="mt-1 text-xs text-neutral-600">{f.helpText}</div> : null}
        </div>
      );
    }

    if (t === "CHECKBOX") {
      const checked = v === true;
      return (
        <div key={f.id}>
          <label className="flex items-center gap-2 text-sm text-neutral-900">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-neutral-300"
              checked={checked}
              onChange={(ev) => setValue(f.key, ev.target.checked)}
              disabled={submitting}
            />
            <span className="font-medium">
              {f.label}
              <span className="text-neutral-500">{req}</span>
            </span>
          </label>
          {f.helpText ? <div className="mt-1 text-xs text-neutral-600">{f.helpText}</div> : null}
        </div>
      );
    }

    const htmlType = t === "EMAIL" ? "email" : t === "PHONE" ? "tel" : "text";

    return (
      <div key={f.id}>
        <label className="mb-1 block text-sm font-medium text-neutral-900">
          {f.label}
          <span className="text-neutral-500">{req}</span>
        </label>
        <input
          className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm"
          type={htmlType}
          placeholder={f.placeholder ?? ""}
          value={typeof v === "string" ? v : ""}
          onChange={(ev) => setValue(f.key, ev.target.value)}
          disabled={submitting}
          autoComplete="off"
        />
        {f.helpText ? <div className="mt-1 text-xs text-neutral-600">{f.helpText}</div> : null}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Demo Capture</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Interner Screen zum Generieren echter Leads (Mobile API v1) – damit /admin/leads und Exports “Content” haben.
        </p>
      </div>

      {keyMissing ? (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="font-medium">Key required</div>
          <div className="mt-1 text-xs text-amber-900/80">
            Erstelle/verwende einen Mobile ApiKey unter{" "}
            <a className="underline" href="/admin/settings/mobile">
              /admin/settings/mobile
            </a>{" "}
            und speichere ihn als <span className="font-mono">leadradar.devMobileApiKey</span>.
          </div>
        </div>
      ) : null}

      <div className="mb-4 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="mb-2 text-sm font-medium text-neutral-900">Mobile API Key (DEV)</div>
        <div className="flex items-center gap-2">
          <input
            className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-mono"
            value={mobileApiKey}
            onChange={(e) => setMobileApiKey(e.target.value)}
            placeholder="paste mobile api key (raw) — header x-api-key"
            disabled={submitting || loadingForms || loadingDetail}
          />
          <button
            type="button"
            onClick={onSaveMobileKey}
            className="shrink-0 rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
            disabled={submitting || loadingForms || loadingDetail}
          >
            Apply
          </button>
        </div>
        <div className="mt-2 text-xs text-neutral-600">
          Required. Wird im Browser gespeichert (LocalStorage) als{" "}
          <span className="font-mono">{LS_DEV_MOBILE_KEY}</span> und als{" "}
          <span className="font-mono">x-api-key</span> an <span className="font-mono">/api/mobile/v1/*</span> gesendet.
        </div>
      </div>

      <div className="mb-4 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="mb-2 text-sm font-medium text-neutral-900">Tenant (optional, DEV Override)</div>
        <div className="flex items-center gap-2">
          <input
            className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm"
            value={tenantSlug}
            onChange={(e) => setTenantSlug(e.target.value)}
            placeholder="tenant slug (z.B. atlex) — leer = Session Tenant"
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
            <div className="text-xs text-neutral-600">Mobile API listet nur ACTIVE Forms, die dem Device (ApiKey) zugewiesen sind.</div>
          </div>

          <button
            type="button"
            onClick={() => void loadForms({ keepSelection: true })}
            className="rounded-xl border border-neutral-200 px-3 py-1.5 text-sm text-neutral-800 hover:bg-neutral-50 disabled:opacity-60"
            disabled={loadingForms || submitting || keyMissing}
            aria-label="Reload forms"
          >
            Reload
          </button>
        </div>

        {loadingForms ? (
          <div className="text-sm text-neutral-600">Loading forms…</div>
        ) : forms.length === 0 ? (
          <div className="text-sm text-neutral-600">Keine ACTIVE Forms gefunden (oder Device hat keine Assignments).</div>
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
            {detail.fields.map((f) => renderField(f))}

            {error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
            ) : null}

            {success ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                Saved ✅ LeadId: <span className="font-mono text-xs">{success.leadId}</span> {success.deduped ? "(deduped)" : ""}
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
                disabled={submitting || !selectedFormId || keyMissing}
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
