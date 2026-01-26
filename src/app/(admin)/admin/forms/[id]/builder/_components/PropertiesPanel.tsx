"use client";

import React, { useMemo, useState } from "react";
import type { BuilderField, FieldType } from "../builder.types";
import { isSystemField } from "./FieldCard";

type Patchable = Pick<
  BuilderField,
  "key" | "label" | "required" | "isActive" | "placeholder" | "helpText" | "config"
>;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function getOptionsFromConfig(config: unknown | null): string[] {
  if (!isRecord(config)) return [];
  const raw = config.options;
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x)).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function setOptionsInConfig(config: unknown | null, options: string[]): unknown {
  const base: Record<string, unknown> = isRecord(config) ? { ...config } : {};
  base.options = options;
  return base;
}

function isSelectType(t: FieldType) {
  return t === "SINGLE_SELECT" || t === "MULTI_SELECT";
}

function PanelInner(props: {
  field: BuilderField;
  onPatch: (fieldId: string, patch: Partial<Patchable>) => void;
  onDangerDelete: (fieldId: string) => void;
  onToggleActive: (fieldId: string, next: boolean) => void;
  busy?: boolean;
}) {
  const f = props.field;
  const system = isSystemField(f);

  const initialOptionsText = useMemo(() => getOptionsFromConfig(f.config).join("\n"), [f.config]);

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [draftLabel, setDraftLabel] = useState(() => f.label ?? "");
  const [draftKey, setDraftKey] = useState(() => f.key ?? "");
  const [draftPlaceholder, setDraftPlaceholder] = useState(() => f.placeholder ?? "");
  const [draftHelpText, setDraftHelpText] = useState(() => f.helpText ?? "");
  const [draftOptionsText, setDraftOptionsText] = useState(() => initialOptionsText);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">Feld-Einstellungen</div>
          <div className="mt-1 text-xs text-slate-500">
            {f.type} • <span className="font-mono">{f.key}</span>
          </div>
        </div>
        <div className="shrink-0">
          <button
            type="button"
            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
            onClick={() => props.onToggleActive(f.id, !f.isActive)}
          >
            {f.isActive ? "Deactivate" : "Activate"}
          </button>
        </div>
      </div>

      <div className="mt-3 flex-1 rounded-xl border border-slate-200 bg-white p-4 overflow-auto">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700">Label</label>
            <input
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
              value={draftLabel}
              onChange={(e) => setDraftLabel(e.target.value)}
              onBlur={() => {
                const next = draftLabel.trim();
                if (next && next !== f.label) props.onPatch(f.id, { label: next });
              }}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-medium text-slate-700">Required</div>
              <div className="text-xs text-slate-500">Pflichtfeld</div>
            </div>
            <input
              type="checkbox"
              checked={Boolean(f.required)}
              onChange={(e) => props.onPatch(f.id, { required: e.target.checked })}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">Placeholder</label>
            <input
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
              value={draftPlaceholder}
              onChange={(e) => setDraftPlaceholder(e.target.value)}
              onBlur={() => {
                const next = draftPlaceholder.trim();
                const cur = f.placeholder ?? "";
                if (next !== cur) props.onPatch(f.id, { placeholder: next ? next : null });
              }}
              placeholder="Optional"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">HelpText</label>
            <textarea
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
              rows={3}
              value={draftHelpText}
              onChange={(e) => setDraftHelpText(e.target.value)}
              onBlur={() => {
                const next = draftHelpText.trim();
                const cur = f.helpText ?? "";
                if (next !== cur) props.onPatch(f.id, { helpText: next ? next : null });
              }}
              placeholder="Optional"
            />
          </div>

          {isSelectType(f.type) ? (
            <div>
              <label className="block text-xs font-medium text-slate-700">Options</label>
              <div className="mt-1 text-xs text-slate-500">Eine Option pro Zeile.</div>
              <textarea
                className="mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300 font-mono"
                rows={6}
                value={draftOptionsText}
                onChange={(e) => setDraftOptionsText(e.target.value)}
                onBlur={() => {
                  const lines = draftOptionsText
                    .split(/\r?\n/g)
                    .map((s) => s.trim())
                    .filter(Boolean);

                  const next = lines.length > 0 ? lines : ["Option 1"];
                  const cur = getOptionsFromConfig(f.config);

                  if (JSON.stringify(next) !== JSON.stringify(cur)) {
                    const nextConfig = setOptionsInConfig(f.config, next);
                    props.onPatch(f.id, { config: nextConfig });
                  }
                }}
              />
            </div>
          ) : null}

          <div className="pt-2">
            <button
              type="button"
              className="text-xs text-slate-600 hover:text-slate-900"
              onClick={() => setAdvancedOpen((s) => !s)}
            >
              {advancedOpen ? "Hide advanced" : "Show advanced"}
            </button>

            {advancedOpen ? (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <label className="block text-xs font-medium text-slate-700">Schlüssel (API-Name)</label>
                <input
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300 font-mono"
                  value={draftKey}
                  onChange={(e) => setDraftKey(e.target.value)}
                  onBlur={() => {
                    const next = draftKey.trim();
                    if (next && next !== f.key) props.onPatch(f.id, { key: next });
                  }}
                />
                <div className="mt-2 text-xs text-slate-500">
                  Muss eindeutig sein (Regex: starts with letter, then letters/numbers/_).
                </div>
              </div>
            ) : null}
          </div>

          <div className="pt-2">
            <div className="text-xs font-semibold text-slate-700">Danger Zone</div>
            <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-900">Delete field</div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {system ? "System/OCR Felder können nicht gelöscht werden." : "Löscht das Feld dauerhaft."}
                </div>
              </div>
              <button
                type="button"
                className={[
                  "shrink-0 rounded-md border px-2 py-1 text-xs",
                  system
                    ? "border-slate-100 bg-slate-50 text-slate-400"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                ].join(" ")}
                disabled={system}
                onClick={() => props.onDangerDelete(f.id)}
              >
                Delete
              </button>
            </div>
          </div>

          {props.busy ? <div className="text-xs text-slate-500">Saving…</div> : null}
        </div>
      </div>
    </div>
  );
}

export function PropertiesPanel(props: {
  field: BuilderField | null;
  onPatch: (fieldId: string, patch: Partial<Patchable>) => void;
  onDangerDelete: (fieldId: string) => void;
  onToggleActive: (fieldId: string, next: boolean) => void;
  busy?: boolean;
}) {
  if (!props.field) {
    return (
      <div className="flex h-full flex-col">
        <div className="text-sm font-semibold text-slate-900">Feld-Einstellungen</div>
        <div className="mt-3 flex-1 rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-sm font-medium text-slate-900">Kein Feld gewählt</div>
          <div className="mt-1 text-xs text-slate-500">Klicke ein Feld im Canvas, um es zu bearbeiten.</div>
        </div>
      </div>
    );
  }

  // key forces remount when selection changes -> no sync effect needed
  return <PanelInner key={props.field.id} {...props} field={props.field} />;
}
