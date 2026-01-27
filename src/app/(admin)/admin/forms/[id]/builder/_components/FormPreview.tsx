"use client";

import * as React from "react";

import type { BuilderField, FieldType } from "../builder.types";
import { getOptionsFromConfig, isSystemField, isRecord } from "../builder.types";

function labelSuffix(field: BuilderField): string {
  const bits: string[] = [];
  if (field.required) bits.push("required");
  if (!field.isActive) bits.push("inactive");
  return bits.length ? ` · ${bits.join(" · ")}` : "";
}

function placeholderFor(type: FieldType): string {
  if (type === "EMAIL") return "name@company.com";
  if (type === "PHONE") return "+41 …";
  if (type === "TEXTAREA") return "Notes / context";
  return "";
}

function cfgDefaultCheckbox(cfg: unknown): boolean {
  if (!isRecord(cfg)) return false;
  const v = cfg.defaultValue;
  return typeof v === "boolean" ? v : false;
}

function SelectPreview(props: { field: BuilderField; multiple?: boolean }) {
  const opts = getOptionsFromConfig(props.field.config);
  const options = opts.length ? opts : ["Option 1"];

  if (props.multiple) {
    return (
      <div className="mt-2 flex flex-col gap-2">
        {options.map((o) => (
          <label key={o} className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" disabled className="h-4 w-4" />
            <span>{o}</span>
          </label>
        ))}
      </div>
    );
  }

  return (
    <select
      disabled
      className="mt-2 h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700"
      value=""
      onChange={() => undefined}
    >
      <option value="">Select…</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function FieldPreview(props: { field: BuilderField }) {
  const f = props.field;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-xs font-semibold text-slate-700">
        {f.label}
        <span className="text-slate-400">{labelSuffix(f)}</span>
      </div>

      {f.helpText ? <div className="mt-1 text-xs text-slate-500">{f.helpText}</div> : null}

      {f.type === "TEXT" || f.type === "EMAIL" || f.type === "PHONE" ? (
        <input
          disabled
          className="mt-2 h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700"
          placeholder={f.placeholder ?? placeholderFor(f.type)}
          value=""
          onChange={() => undefined}
        />
      ) : null}

      {f.type === "TEXTAREA" ? (
        <textarea
          disabled
          className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
          placeholder={f.placeholder ?? placeholderFor(f.type)}
          value=""
          onChange={() => undefined}
          rows={4}
        />
      ) : null}

      {f.type === "CHECKBOX" ? (
        <label className="mt-2 flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" disabled className="h-4 w-4" defaultChecked={cfgDefaultCheckbox(f.config)} />
          <span>{f.placeholder?.trim().length ? f.placeholder : "Yes / No"}</span>
        </label>
      ) : null}

      {f.type === "SINGLE_SELECT" ? <SelectPreview field={f} /> : null}
      {f.type === "MULTI_SELECT" ? <SelectPreview field={f} multiple /> : null}

      <div className="mt-2 text-[11px] text-slate-400">
        <span className="lr-mono">{f.key}</span> · <span className="lr-mono">{f.type}</span>
      </div>
    </div>
  );
}

export default function FormPreview(props: { name: string; description: string | null; fields: BuilderField[] }) {
  const visible = props.fields
    .filter((f) => f.isActive)
    .filter((f) => !isSystemField(f))
    .slice()
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-bold text-slate-900">Preview</div>
          <div className="mt-0.5 text-xs text-slate-500">Read-only preview (mobile-style).</div>
        </div>
        <div className="text-xs text-slate-500">
          Form: <span className="font-semibold text-slate-700">{props.name || "—"}</span>
        </div>
      </div>

      {props.description ? <div className="mt-2 text-sm text-slate-600">{props.description}</div> : null}

      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="mx-auto w-full max-w-[560px]">
          <div className="text-xs font-semibold text-slate-600">Capture lead</div>

          {visible.length === 0 ? (
            <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
              No active fields yet. Add fields in <span className="font-semibold">Build</span> mode.
            </div>
          ) : (
            <div className="mt-3 flex flex-col gap-3">
              {visible.map((f) => (
                <FieldPreview key={f.id} field={f} />
              ))}

              <button
                type="button"
                disabled
                className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700"
              >
                Submit (preview)
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 text-xs text-slate-500">
        Note: System/OCR fields are hidden in preview.
      </div>
    </div>
  );
}
