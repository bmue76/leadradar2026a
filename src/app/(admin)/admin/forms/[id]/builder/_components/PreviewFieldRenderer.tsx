"use client";

import React, { useMemo } from "react";
import type { BuilderField } from "../builder.types";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function getInputType(field: BuilderField): string {
  const cfg: any = field.config ?? null;
  const uiType = cfg?.ui?.inputType;
  if (typeof uiType === "string" && uiType.length > 0) return uiType;

  if (field.type === "EMAIL") return "email";
  if (field.type === "PHONE") return "tel";
  return "text";
}

function getSelectOptions(field: BuilderField): string[] {
  const cfg: any = field.config ?? null;
  const opts = cfg?.options ?? cfg?.selectOptions ?? null;
  if (Array.isArray(opts)) return opts.map((x) => String(x));
  if (typeof cfg?.optionsText === "string") {
    return cfg.optionsText
      .split("\n")
      .map((s: string) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function Stars({ count, accent }: { count: number; accent?: string | null }) {
  const stars = Array.from({ length: 5 }).map((_, i) => i < count);
  return (
    <div className="flex items-center gap-1">
      {stars.map((on, i) => (
        <svg
          key={i}
          width="18"
          height="18"
          viewBox="0 0 24 24"
          className={cx(on ? "opacity-100" : "opacity-30")}
          style={on && accent ? ({ color: accent } as any) : undefined}
        >
          <path
            fill="currentColor"
            d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
          />
        </svg>
      ))}
    </div>
  );
}

export default function PreviewFieldRenderer({ field, accent }: { field: BuilderField; accent?: string | null }) {
  const inputType = getInputType(field);
  const isStars = useMemo(() => (field.config as any)?.uiVariant === "stars", [field.config]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">{field.label}</div>
          {field.helpText ? <div className="mt-0.5 text-xs text-slate-600">{field.helpText}</div> : null}
        </div>
        {field.required ? (
          <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-700">
            Pflicht
          </span>
        ) : null}
      </div>

      <div className="mt-3">
        {field.type === "TEXTAREA" ? (
          <textarea
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            placeholder={field.placeholder ?? ""}
            rows={3}
            disabled
          />
        ) : field.type === "CHECKBOX" ? (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" disabled />
            <span>Auswahl</span>
          </label>
        ) : field.type === "MULTI_SELECT" ? (
          <div className="grid gap-2">
            {getSelectOptions(field).slice(0, 6).map((opt) => (
              <label key={opt} className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" disabled />
                <span>{opt}</span>
              </label>
            ))}
          </div>
        ) : field.type === "SINGLE_SELECT" ? (
          isStars ? (
            <div className="flex items-center justify-between">
              <Stars count={4} accent={accent} />
              <span className="text-xs text-slate-500">Tippen in Mobile</span>
            </div>
          ) : (
            <select className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" disabled>
              <option value="">Bitte auswaehlen…</option>
              {getSelectOptions(field).slice(0, 8).map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          )
        ) : (
          <input
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            placeholder={field.placeholder ?? ""}
            type={inputType}
            disabled
          />
        )}
      </div>
    </div>
  );
}
