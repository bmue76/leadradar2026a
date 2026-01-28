import * as React from "react";
import type { BuilderField } from "../builder.types";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function optionsFromConfig(config: unknown): string[] {
  if (!isRecord(config)) return [];
  const opts = config.options;
  if (Array.isArray(opts)) {
    return opts.map((x) => String(x)).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function FieldWrap(props: { label: string; required: boolean; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-2 text-sm font-semibold text-slate-900">
        {props.label}
        {props.required ? <span className="ml-1 text-slate-400">*</span> : null}
      </div>
      {props.children}
    </div>
  );
}

export default function PreviewFieldRenderer(props: { field: BuilderField }) {
  const f = props.field;
  const t = String(f.type);

  if (t === "TEXT" || t === "EMAIL" || t === "PHONE") {
    return (
      <FieldWrap label={f.label} required={!!f.required}>
        <input
          disabled
          value=""
          placeholder={f.placeholder ?? ""}
          className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700"
        />
      </FieldWrap>
    );
  }

  if (t === "TEXTAREA") {
    return (
      <FieldWrap label={f.label} required={!!f.required}>
        <textarea
          disabled
          value=""
          placeholder={f.placeholder ?? ""}
          className="min-h-[96px] w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
        />
      </FieldWrap>
    );
  }

  if (t === "SINGLE_SELECT") {
    const options = optionsFromConfig(f.config);
    return (
      <FieldWrap label={f.label} required={!!f.required}>
        <select
          disabled
          className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700"
        >
          <option value="">Select…</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </FieldWrap>
    );
  }

  if (t === "MULTI_SELECT") {
    const options = optionsFromConfig(f.config);
    return (
      <FieldWrap label={f.label} required={!!f.required}>
        <div className="flex flex-col gap-2">
          {(options.length ? options : ["Option 1"]).map((o) => (
            <label key={o} className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" disabled className="h-4 w-4" />
              <span>{o}</span>
            </label>
          ))}
        </div>
      </FieldWrap>
    );
  }

  if (t === "CHECKBOX") {
    return (
      <FieldWrap label={f.label} required={!!f.required}>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" disabled className="h-4 w-4" />
          <span>{f.helpText ?? "Yes / No"}</span>
        </label>
      </FieldWrap>
    );
  }

  // Defensive fallback (no crash)
  return (
    <FieldWrap label={f.label} required={!!f.required}>
      <div className="text-sm text-slate-600">
        Unsupported field type: <span className="font-mono">{t}</span>
      </div>
    </FieldWrap>
  );
}