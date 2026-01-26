"use client";

import * as React from "react";
import type { FormStatus } from "../builder.types";
import { isRecord } from "../builder.types";

function getFromName(cfg: unknown): string {
  if (!isRecord(cfg)) return "";
  const v = cfg.fromName;
  return typeof v === "string" ? v : "";
}

export default function FormSettingsPanel(props: {
  formId: string;
  name: string;
  description: string | null;
  status: FormStatus;
  config: unknown | null;
  onPatchBasics: (body: { name?: string; description?: string | null; configPatch?: Record<string, unknown> }) => void;
  onPatchStatus: (status: FormStatus) => void;
}) {
  const [name, setName] = React.useState(props.name);
  const [description, setDescription] = React.useState(props.description ?? "");
  const [fromName, setFromName] = React.useState(getFromName(props.config));

  React.useEffect(() => {
    setName(props.name);
    setDescription(props.description ?? "");
    setFromName(getFromName(props.config));
  }, [props.formId, props.name, props.description, props.config]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-bold">Form settings</div>
        <div className="text-xs text-slate-500">{props.status}</div>
      </div>

      <div className="mt-3 flex flex-col gap-3">
        <div>
          <div className="text-xs font-semibold text-slate-600">Form name</div>
          <input
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              const v = name.trim();
              if (v && v !== props.name) props.onPatchBasics({ name: v });
            }}
          />
        </div>

        <div>
          <div className="text-xs font-semibold text-slate-600">Description</div>
          <textarea
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            onBlur={() => {
              const v = description.trim();
              const next = v.length ? v : null;
              if ((props.description ?? null) !== next) props.onPatchBasics({ description: next });
            }}
          />
        </div>

        <div>
          <div className="text-xs font-semibold text-slate-600">Status</div>
          <select
            className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
            value={props.status}
            onChange={(e) => props.onPatchStatus(e.target.value as FormStatus)}
          >
            <option value="DRAFT">Draft</option>
            <option value="ACTIVE">Active</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </div>

        <div>
          <div className="text-xs font-semibold text-slate-600">From name (config)</div>
          <input
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            value={fromName}
            onChange={(e) => setFromName(e.target.value)}
            onBlur={() => {
              const v = fromName.trim();
              const current = getFromName(props.config);
              if (v !== current) props.onPatchBasics({ configPatch: { fromName: v } });
            }}
            placeholder="e.g. Atlex Messe-Team"
          />
          <div className="mt-1 text-[11px] text-slate-500">
            Stored in <span className="lr-mono">form.config.fromName</span> (no schema change).
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs font-semibold text-slate-700">Coming soon (Phase 2/3)</div>
          <ul className="mt-2 list-disc pl-5 text-xs text-slate-600">
            <li>Branding per form (colors)</li>
            <li>Dark mode (preview + mobile theme)</li>
            <li>Templates & sections</li>
            <li>Conditional logic</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
