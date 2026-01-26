"use client";

import * as React from "react";
import type { BuilderField, FieldType } from "../builder.types";
import { getOptionsFromConfig, setOptionsInConfig } from "../builder.types";

function linesToOptions(s: string): string[] {
  return s
    .split(/\r?\n/g)
    .map((x) => x.trim())
    .filter(Boolean);
}

function optionsToLines(opts: string[]): string {
  return opts.join("\n");
}

export default function InlineFieldEditor(props: {
  field: BuilderField;
  isSystem: boolean;
  onPatch: (
    patch: Partial<{
      key: string;
      label: string;
      type: FieldType;
      required: boolean;
      isActive: boolean;
      placeholder: string | null;
      helpText: string | null;
      config: unknown | null;
    }>
  ) => void;
}) {
  const f = props.field;

  const [label, setLabel] = React.useState(f.label);
  const [key, setKey] = React.useState(f.key);
  const [placeholder, setPlaceholder] = React.useState(f.placeholder ?? "");
  const [helpText, setHelpText] = React.useState(f.helpText ?? "");
  const [required, setRequired] = React.useState(Boolean(f.required));
  const [isActive, setIsActive] = React.useState(Boolean(f.isActive));

  const isSelect = f.type === "SINGLE_SELECT" || f.type === "MULTI_SELECT";
  const [optionsText, setOptionsText] = React.useState(() => optionsToLines(getOptionsFromConfig(f.config)));

  React.useEffect(() => {
    setLabel(f.label);
    setKey(f.key);
    setPlaceholder(f.placeholder ?? "");
    setHelpText(f.helpText ?? "");
    setRequired(Boolean(f.required));
    setIsActive(Boolean(f.isActive));
    setOptionsText(optionsToLines(getOptionsFromConfig(f.config)));
  }, [f.id, f.label, f.key, f.placeholder, f.helpText, f.required, f.isActive, f.type, f.config]);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-xs font-semibold text-slate-600">Label</div>
          <input
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={() => {
              if (props.isSystem) return;
              const v = label.trim();
              if (v && v !== f.label) props.onPatch({ label: v });
            }}
            disabled={props.isSystem}
          />
        </div>

        <div>
          <div className="text-xs font-semibold text-slate-600">Key</div>
          <input
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            onBlur={() => {
              if (props.isSystem) return;
              const v = key.trim();
              if (v && v !== f.key) props.onPatch({ key: v });
            }}
            disabled={props.isSystem}
          />
          {props.isSystem ? <div className="mt-1 text-[11px] text-slate-500">System fields are locked.</div> : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={required}
            onChange={(e) => {
              setRequired(e.target.checked);
              props.onPatch({ required: e.target.checked });
            }}
            disabled={props.isSystem}
          />
          Required
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => {
              setIsActive(e.target.checked);
              props.onPatch({ isActive: e.target.checked });
            }}
          />
          Active
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-xs font-semibold text-slate-600">Placeholder</div>
          <input
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            value={placeholder}
            onChange={(e) => setPlaceholder(e.target.value)}
            onBlur={() => {
              const v = placeholder.trim();
              const next = v.length ? v : null;
              if ((f.placeholder ?? null) !== next) props.onPatch({ placeholder: next });
            }}
          />
        </div>

        <div>
          <div className="text-xs font-semibold text-slate-600">Help text</div>
          <input
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            value={helpText}
            onChange={(e) => setHelpText(e.target.value)}
            onBlur={() => {
              const v = helpText.trim();
              const next = v.length ? v : null;
              if ((f.helpText ?? null) !== next) props.onPatch({ helpText: next });
            }}
          />
        </div>
      </div>

      {isSelect ? (
        <div>
          <div className="text-xs font-semibold text-slate-600">Options (one per line)</div>
          <textarea
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            value={optionsText}
            onChange={(e) => setOptionsText(e.target.value)}
            rows={5}
            onBlur={() => {
              const opts = linesToOptions(optionsText);
              if (opts.length < 1) return; // API enforces >= 1
              const nextConfig = setOptionsInConfig(f.config, opts);
              props.onPatch({ config: nextConfig });
            }}
          />
          <div className="mt-1 text-[11px] text-slate-500">Minimum 1 option.</div>
        </div>
      ) : null}
    </div>
  );
}
