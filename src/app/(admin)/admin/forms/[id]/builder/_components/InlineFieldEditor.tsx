"use client";

import * as React from "react";
import type { FieldType } from "@prisma/client";
import { getOptionsFromConfig, setOptionsInConfig } from "./builder.types";

type Patch = Partial<{
  label: string;
  required: boolean;
  isActive: boolean;
  placeholder: string | null;
  helpText: string | null;
  config: unknown;
}>;

function isSelectType(t: FieldType) {
  return t === "SINGLE_SELECT" || t === "MULTI_SELECT";
}

export default function InlineFieldEditor(props: {
  type: FieldType;
  label: string;
  required: boolean;
  isActive: boolean;
  placeholder: string | null;
  helpText: string | null;
  config: unknown;
  onPatch: (patch: Patch) => void;
  disabled?: boolean;
}) {
  // avoid setState-in-effect lint: component remounts via key=field.id in parent
  const [label, setLabel] = React.useState(props.label ?? "");
  const [placeholder, setPlaceholder] = React.useState(props.placeholder ?? "");
  const [helpText, setHelpText] = React.useState(props.helpText ?? "");

  const options = React.useMemo(() => getOptionsFromConfig(props.config), [props.config]);
  const [optionsText, setOptionsText] = React.useState(options.join("\n"));

  const disabled = Boolean(props.disabled);

  const commitLabel = () => {
    const v = label.trim();
    if (v && v !== props.label) props.onPatch({ label: v });
  };

  const commitPlaceholder = () => {
    const v = placeholder.trim();
    const next = v ? v : null;
    if (next !== props.placeholder) props.onPatch({ placeholder: next });
  };

  const commitHelpText = () => {
    const v = helpText.trim();
    const next = v ? v : null;
    if (next !== props.helpText) props.onPatch({ helpText: next });
  };

  const commitOptions = () => {
    if (!isSelectType(props.type)) return;
    const next = optionsText
      .split(/\r?\n/g)
      .map((s) => s.trim())
      .filter(Boolean);

    // backend requires at least 1 option for SELECT types
    const safe = next.length > 0 ? next : ["Option 1"];
    const current = getOptionsFromConfig(props.config);
    const same =
      current.length === safe.length && current.every((v, i) => v === safe[i]);

    if (!same) {
      props.onPatch({ config: setOptionsInConfig(props.config, safe) });
    }
  };

  return (
    <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3">
      <div className="grid grid-cols-1 gap-3">
        <label className="grid gap-1">
          <span className="text-xs font-semibold text-slate-600">Label</span>
          <input
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={commitLabel}
            disabled={disabled}
          />
        </label>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={props.required}
              onChange={(e) => props.onPatch({ required: e.target.checked })}
              disabled={disabled}
            />
            Required
          </label>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={props.isActive}
              onChange={(e) => props.onPatch({ isActive: e.target.checked })}
              disabled={disabled}
            />
            Active
          </label>
        </div>

        <label className="grid gap-1">
          <span className="text-xs font-semibold text-slate-600">Placeholder</span>
          <input
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm"
            value={placeholder}
            onChange={(e) => setPlaceholder(e.target.value)}
            onBlur={commitPlaceholder}
            disabled={disabled}
          />
        </label>

        <label className="grid gap-1">
          <span className="text-xs font-semibold text-slate-600">Help text</span>
          <input
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm"
            value={helpText}
            onChange={(e) => setHelpText(e.target.value)}
            onBlur={commitHelpText}
            disabled={disabled}
          />
        </label>

        {isSelectType(props.type) ? (
          <label className="grid gap-1">
            <span className="text-xs font-semibold text-slate-600">Options (one per line)</span>
            <textarea
              className="min-h-[96px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              value={optionsText}
              onChange={(e) => setOptionsText(e.target.value)}
              onBlur={commitOptions}
              disabled={disabled}
            />
            <div className="text-xs text-slate-500">At least one option is required.</div>
          </label>
        ) : null}
      </div>
    </div>
  );
}
