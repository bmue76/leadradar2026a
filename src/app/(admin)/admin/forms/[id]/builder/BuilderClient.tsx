"use client";

import Link from "next/link";
import * as React from "react";
import { adminFetchJson } from "../../../_lib/adminFetch";

type ApiOk<T> = { ok: true; data: T; traceId?: string };
type ApiErr = { ok: false; error: { code: string; message: string }; traceId?: string };
type ApiResponse<T> = ApiOk<T> | ApiErr;

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

type DraftState = {
  key: string;
  label: string;
  type: string;
  required: boolean;
  isActive: boolean;
  placeholder: string;
  helpText: string;
  optionsText: string;
  checkboxDefault: boolean;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseOptions(config: unknown): string[] {
  if (!isRecord(config)) return [];
  const opts = config.options;
  if (!Array.isArray(opts)) return [];
  return opts.map((x) => String(x)).map((s) => s.trim()).filter(Boolean);
}

function parseCheckboxDefault(config: unknown): boolean {
  if (!isRecord(config)) return false;
  const v = config.defaultValue;
  return typeof v === "boolean" ? v : Boolean(v);
}

function sortFields(fields: FormField[]) {
  return [...fields].sort((a, b) => {
    const ao = typeof a.sortOrder === "number" ? a.sortOrder : 0;
    const bo = typeof b.sortOrder === "number" ? b.sortOrder : 0;
    if (ao !== bo) return ao - bo;
    return String(a.label || "").localeCompare(String(b.label || ""));
  });
}

async function api<T>(path: string, init?: RequestInit): Promise<ApiResponse<T>> {
  return (await adminFetchJson(path, init)) as ApiResponse<T>;
}

const TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "TEXT", label: "Text" },
  { value: "TEXTAREA", label: "Textarea" },
  { value: "EMAIL", label: "Email" },
  { value: "PHONE", label: "Phone" },
  { value: "SINGLE_SELECT", label: "Select (single)" },
  { value: "MULTI_SELECT", label: "Select (multi)" },
  { value: "CHECKBOX", label: "Checkbox" },
];

function typeLabel(t: string): string {
  const u = (t || "").toUpperCase();
  const hit = TYPE_OPTIONS.find((x) => x.value === u);
  return hit ? hit.label : u || "—";
}

export default function BuilderClient({ formId }: { formId: string }) {
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [traceId, setTraceId] = React.useState<string | null>(null);

  const [form, setForm] = React.useState<FormDetail | null>(null);
  const [selectedId, setSelectedId] = React.useState<string>("");

  const [draft, setDraft] = React.useState<DraftState | null>(null);

  const [saving, setSaving] = React.useState(false);
  const [saveErr, setSaveErr] = React.useState<string | null>(null);
  const [saveTrace, setSaveTrace] = React.useState<string | null>(null);

  const fields = React.useMemo(() => sortFields(form?.fields || []), [form?.fields]);
  const selected = React.useMemo(() => fields.find((f) => f.id === selectedId) || null, [fields, selectedId]);

  const reload = React.useCallback(async () => {
    setLoading(true);
    setErr(null);
    setTraceId(null);
    setSaveErr(null);
    setSaveTrace(null);

    const res = await api<FormDetail>(`/api/admin/v1/forms/${formId}`, { method: "GET" });
    if (!res.ok) {
      setForm(null);
      setSelectedId("");
      setDraft(null);
      setErr(res.error.message || "Could not load form.");
      setTraceId(res.traceId || null);
      setLoading(false);
      return;
    }

    setForm(res.data);

    const nextSelected =
      selectedId && res.data.fields.some((f) => f.id === selectedId)
        ? selectedId
        : res.data.fields[0]?.id || "";

    setSelectedId(nextSelected);
    setLoading(false);
  }, [formId, selectedId]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  React.useEffect(() => {
    if (!selected) {
      setDraft(null);
      return;
    }

    const options = parseOptions(selected.config);
    const checkboxDefault = parseCheckboxDefault(selected.config);

    setDraft({
      key: selected.key,
      label: selected.label,
      type: String(selected.type || "").toUpperCase(),
      required: Boolean(selected.required),
      isActive: Boolean(selected.isActive),
      placeholder: selected.placeholder ?? "",
      helpText: selected.helpText ?? "",
      optionsText: options.join("\n"),
      checkboxDefault,
    });

    setSaveErr(null);
    setSaveTrace(null);
  }, [selected]);

  async function createField() {
    if (!form) return;
    setSaveErr(null);
    setSaveTrace(null);

    const key = `field_${Date.now()}`;
    const payload = {
      key,
      label: "New field",
      type: "TEXT",
      required: false,
      isActive: true,
    };

    const res = await api<FormField>(`/api/admin/v1/forms/${form.id}/fields`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      setSaveErr(res.error.message || "Could not create field.");
      setSaveTrace(res.traceId || null);
      return;
    }

    await reload();
    setSelectedId(res.data.id);
  }

  async function save() {
    if (!form || !selected || !draft) return;

    setSaving(true);
    setSaveErr(null);
    setSaveTrace(null);

    const type = draft.type.toUpperCase();
    let config: unknown = undefined;

    if (type === "SINGLE_SELECT" || type === "MULTI_SELECT") {
      const options = draft.optionsText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      config = { options };
    } else if (type === "CHECKBOX") {
      config = { defaultValue: Boolean(draft.checkboxDefault) };
    }

    const payload: Record<string, unknown> = {
      key: draft.key.trim(),
      label: draft.label.trim(),
      type,
      required: Boolean(draft.required),
      isActive: Boolean(draft.isActive),
      placeholder: draft.placeholder.trim().length ? draft.placeholder.trim() : null,
      helpText: draft.helpText.trim().length ? draft.helpText.trim() : null,
      config: config ?? null,
    };

    const res = await api<FormField>(`/api/admin/v1/forms/${form.id}/fields/${selected.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    setSaving(false);

    if (!res.ok) {
      setSaveErr(res.error.message || "Could not save.");
      setSaveTrace(res.traceId || null);
      return;
    }

    await reload();
  }

  function renderPreviewField(f: FormField) {
    const t = String(f.type || "").toUpperCase();
    const label = f.label || f.key;
    const options = parseOptions(f.config);

    if (t === "TEXTAREA") {
      return (
        <div key={f.id} className="space-y-1">
          <div className="text-sm font-medium text-gray-900">
            {label}
            {f.required ? <span className="text-gray-400"> *</span> : null}
          </div>
          <textarea
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            rows={3}
            placeholder={f.placeholder ?? ""}
          />
          {f.helpText ? <div className="text-xs text-gray-500">{f.helpText}</div> : null}
        </div>
      );
    }

    if (t === "EMAIL") {
      return (
        <div key={f.id} className="space-y-1">
          <div className="text-sm font-medium text-gray-900">
            {label}
            {f.required ? <span className="text-gray-400"> *</span> : null}
          </div>
          <input
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            type="email"
            placeholder={f.placeholder ?? ""}
          />
          {f.helpText ? <div className="text-xs text-gray-500">{f.helpText}</div> : null}
        </div>
      );
    }

    if (t === "PHONE") {
      return (
        <div key={f.id} className="space-y-1">
          <div className="text-sm font-medium text-gray-900">
            {label}
            {f.required ? <span className="text-gray-400"> *</span> : null}
          </div>
          <input
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            type="tel"
            placeholder={f.placeholder ?? ""}
          />
          {f.helpText ? <div className="text-xs text-gray-500">{f.helpText}</div> : null}
        </div>
      );
    }

    if (t === "SINGLE_SELECT") {
      return (
        <div key={f.id} className="space-y-1">
          <div className="text-sm font-medium text-gray-900">
            {label}
            {f.required ? <span className="text-gray-400"> *</span> : null}
          </div>
          <select className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
            <option value="">—</option>
            {options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          {f.helpText ? <div className="text-xs text-gray-500">{f.helpText}</div> : null}
        </div>
      );
    }

    if (t === "MULTI_SELECT") {
      return (
        <div key={f.id} className="space-y-1">
          <div className="text-sm font-medium text-gray-900">
            {label}
            {f.required ? <span className="text-gray-400"> *</span> : null}
          </div>
          <select multiple className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
            {options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          {f.helpText ? <div className="text-xs text-gray-500">{f.helpText}</div> : null}
        </div>
      );
    }

    if (t === "CHECKBOX") {
      return (
        <div key={f.id} className="space-y-1">
          <label className="flex items-center gap-2 text-sm text-gray-900">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300"
              defaultChecked={parseCheckboxDefault(f.config)}
            />
            <span className="font-medium">
              {label}
              {f.required ? <span className="text-gray-400"> *</span> : null}
            </span>
          </label>
          {f.helpText ? <div className="text-xs text-gray-500">{f.helpText}</div> : null}
        </div>
      );
    }

    return (
      <div key={f.id} className="space-y-1">
        <div className="text-sm font-medium text-gray-900">
          {label}
          {f.required ? <span className="text-gray-400"> *</span> : null}
        </div>
        <input
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
          type="text"
          placeholder={f.placeholder ?? ""}
        />
        {f.helpText ? <div className="text-xs text-gray-500">{f.helpText}</div> : null}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] px-6 py-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm text-gray-500">
            <Link href={`/admin/forms/${formId}`} className="hover:text-gray-900">
              ← Back to form
            </Link>
          </div>
          <h1 className="mt-1 text-xl font-semibold text-gray-900">
            Builder{form ? <span className="text-gray-400"> · {form.name}</span> : null}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void reload()}
            className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
            disabled={loading || saving}
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void save()}
            className="rounded-lg bg-black px-4 py-2 text-sm text-white hover:bg-black/90 disabled:opacity-60"
            disabled={!form || !selected || !draft || loading || saving}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border bg-white p-6 text-sm text-gray-600">Loading…</div>
      ) : err ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
          <div className="font-medium">{err}</div>
          {traceId ? (
            <div className="mt-1 text-xs">
              traceId: <span className="font-mono">{traceId}</span>
            </div>
          ) : null}
        </div>
      ) : form ? (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr_360px]">
          {/* Left: Fields */}
          <div className="rounded-2xl border bg-white">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-gray-900">Fields</div>
                <div className="text-xs text-gray-500">{fields.length} field(s)</div>
              </div>
              <button
                type="button"
                onClick={() => void createField()}
                className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50"
              >
                Add
              </button>
            </div>

            <div className="max-h-[calc(100vh-220px)] overflow-auto p-2">
              {fields.length === 0 ? (
                <div className="p-4 text-sm text-gray-600">No fields yet.</div>
              ) : (
                <div className="space-y-1">
                  {fields.map((f) => {
                    const active = f.id === selectedId;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setSelectedId(f.id)}
                        className={[
                          "w-full rounded-xl px-3 py-2 text-left",
                          active ? "bg-gray-900 text-white" : "hover:bg-gray-50",
                        ].join(" ")}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold">{f.label || f.key}</div>
                            <div className={active ? "text-xs text-white/70" : "text-xs text-gray-500"}>
                              {typeLabel(String(f.type))}
                              {f.required ? " · required" : ""}
                              {!f.isActive ? " · inactive" : ""}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Middle: Preview */}
          <div className="rounded-2xl border bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-gray-900">Preview</div>
                <div className="text-xs text-gray-500">Online-only MVP preview</div>
              </div>
              <div className="text-xs text-gray-400">Shows active fields</div>
            </div>

            <div className="space-y-4">
              {fields.filter((f) => f.isActive).length === 0 ? (
                <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-gray-600">
                  No active fields.
                </div>
              ) : (
                fields.filter((f) => f.isActive).map((f) => renderPreviewField(f))
              )}
            </div>
          </div>

          {/* Right: Inspector */}
          <div className="rounded-2xl border bg-white p-5">
            <div className="mb-3">
              <div className="text-sm font-semibold text-gray-900">Properties</div>
              <div className="text-xs text-gray-500">Edit field settings and save.</div>
            </div>

            {saveErr ? (
              <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                <div className="font-medium">{saveErr}</div>
                {saveTrace ? (
                  <div className="mt-1 text-xs">
                    traceId: <span className="font-mono">{saveTrace}</span>
                  </div>
                ) : null}
              </div>
            ) : null}

            {!selected || !draft ? (
              <div className="text-sm text-gray-600">Select a field.</div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-900">Label</label>
                  <input
                    className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                    value={draft.label}
                    onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-900">Key</label>
                  <input
                    className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-mono"
                    value={draft.key}
                    onChange={(e) => setDraft({ ...draft, key: e.target.value })}
                  />
                  <div className="mt-1 text-xs text-gray-500">Must be unique per form.</div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-900">Type</label>
                  <select
                    className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
                    value={draft.type}
                    onChange={(e) => {
                      const nextType = e.target.value;

                      const next: DraftState = { ...draft, type: nextType };

                      // keep some sane defaults when switching type
                      if (
                        (nextType === "SINGLE_SELECT" || nextType === "MULTI_SELECT") &&
                        !String(draft.optionsText || "").trim()
                      ) {
                        next.optionsText = "Option 1\nOption 2";
                      }

                      if (nextType === "CHECKBOX") {
                        next.checkboxDefault = Boolean(draft.checkboxDefault);
                      }

                      setDraft(next);
                    }}
                  >
                    {TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>

                {draft.type === "SINGLE_SELECT" || draft.type === "MULTI_SELECT" ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-900">Options</label>
                    <textarea
                      className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-mono"
                      rows={6}
                      placeholder={"One option per line"}
                      value={draft.optionsText}
                      onChange={(e) => setDraft({ ...draft, optionsText: e.target.value })}
                    />
                    <div className="mt-1 text-xs text-gray-500">One option per line.</div>
                  </div>
                ) : null}

                {draft.type === "CHECKBOX" ? (
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                    <label className="flex items-center gap-2 text-sm text-gray-900">
                      <input
                        type="checkbox"
                        checked={draft.checkboxDefault}
                        onChange={(e) => setDraft({ ...draft, checkboxDefault: e.target.checked })}
                      />
                      Default checked
                    </label>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <label className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={draft.required}
                      onChange={(e) => setDraft({ ...draft, required: e.target.checked })}
                    />
                    Required
                  </label>

                  <label className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={draft.isActive}
                      onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
                    />
                    Active
                  </label>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-900">Placeholder</label>
                  <input
                    className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                    value={draft.placeholder}
                    onChange={(e) => setDraft({ ...draft, placeholder: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-900">Help text</label>
                  <textarea
                    className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                    rows={3}
                    value={draft.helpText}
                    onChange={(e) => setDraft({ ...draft, helpText: e.target.value })}
                  />
                </div>

                <div className="text-xs text-gray-400">
                  Saving updates the field via{" "}
                  <span className="font-mono">PATCH /api/admin/v1/forms/:id/fields/:fieldId</span>.
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
