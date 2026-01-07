"use client";

import * as React from "react";
import type { FormField } from "../../formDetail.types";
import { parseCheckboxDefault, parseOptions } from "../../_lib/fieldConfig";

function renderPreviewField(f: FormField) {
  const t = String(f.type || "").toUpperCase();
  const label = f.label || f.key;
  const options = parseOptions(f.config);

  if (t === "TEXTAREA") {
    return (
      <div key={f.id} className="space-y-1">
        <div className="text-sm font-medium text-gray-900">
          {label}{f.required ? <span className="text-gray-400"> *</span> : null}
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
          {label}{f.required ? <span className="text-gray-400"> *</span> : null}
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
          {label}{f.required ? <span className="text-gray-400"> *</span> : null}
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
          {label}{f.required ? <span className="text-gray-400"> *</span> : null}
        </div>
        <select className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
          <option value="">—</option>
          {options.map((o) => (
            <option key={o} value={o}>{o}</option>
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
          {label}{f.required ? <span className="text-gray-400"> *</span> : null}
        </div>
        <select multiple className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
          {options.map((o) => (
            <option key={o} value={o}>{o}</option>
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
            {label}{f.required ? <span className="text-gray-400"> *</span> : null}
          </span>
        </label>
        {f.helpText ? <div className="text-xs text-gray-500">{f.helpText}</div> : null}
      </div>
    );
  }

  return (
    <div key={f.id} className="space-y-1">
      <div className="text-sm font-medium text-gray-900">
        {label}{f.required ? <span className="text-gray-400"> *</span> : null}
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

export default function PreviewPane({ fields }: { fields: FormField[] }) {
  return (
    <div className="rounded-2xl border bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-gray-900">Preview</div>
          <div className="text-xs text-gray-500">Online-only MVP preview</div>
        </div>
        <div className="text-xs text-gray-400">Shows active fields</div>
      </div>

      <div className="space-y-4">
        {fields.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-gray-600">
            No active fields.
          </div>
        ) : (
          fields.map((f) => renderPreviewField(f))
        )}
      </div>
    </div>
  );
}
