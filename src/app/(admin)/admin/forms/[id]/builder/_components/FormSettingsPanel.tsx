"use client";

import React, { useEffect, useMemo, useState } from "react";

function safeGet(obj: any, path: string[], fallback: any) {
  let cur = obj;
  for (const p of path) {
    if (!cur || typeof cur !== "object") return fallback;
    cur = cur[p];
  }
  return cur ?? fallback;
}

function mergeDeep(target: any, patch: any) {
  const out = { ...(target ?? {}) };
  for (const k of Object.keys(patch ?? {})) {
    const v = patch[k];
    if (v && typeof v === "object" && !Array.isArray(v)) out[k] = mergeDeep(out[k], v);
    else out[k] = v;
  }
  return out;
}

export default function FormSettingsPanel({
  formId,
  name,
  description,
  status,
  config,
  onPatchBasics,
  onPatchStatus,
  busy,
}: {
  formId: string;
  name: string;
  description: string | null;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  config: Record<string, unknown> | null;
  onPatchBasics: (body: { name?: string; description?: string | null; configPatch?: Record<string, unknown> }) => Promise<void>;
  onPatchStatus: (status: "DRAFT" | "ACTIVE" | "ARCHIVED") => Promise<void>;
  busy?: boolean;
}) {
  const cfg = (config ?? {}) as any;

  const [draftName, setDraftName] = useState(name);
  const [draftDesc, setDraftDesc] = useState(description ?? "");
  const [draftStatus, setDraftStatus] = useState(status);

  const [headerTitle, setHeaderTitle] = useState<string>(safeGet(cfg, ["ui", "header", "title"], "") ?? "");
  const [headerSubtitle, setHeaderSubtitle] = useState<string>(safeGet(cfg, ["ui", "header", "subtitle"], "") ?? "");
  const [accentColor, setAccentColor] = useState<string>(safeGet(cfg, ["ui", "accentColor"], "") ?? "");

  useEffect(() => {
    setDraftName(name);
    setDraftDesc(description ?? "");
    setDraftStatus(status);

    setHeaderTitle(safeGet(cfg, ["ui", "header", "title"], "") ?? "");
    setHeaderSubtitle(safeGet(cfg, ["ui", "header", "subtitle"], "") ?? "");
    setAccentColor(safeGet(cfg, ["ui", "accentColor"], "") ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formId, name, description, status]);

  const configPatch = useMemo(() => {
    const patch = {
      ui: {
        header: {
          title: headerTitle?.trim() ? headerTitle.trim() : null,
          subtitle: headerSubtitle?.trim() ? headerSubtitle.trim() : null,
        },
        accentColor: accentColor?.trim() ? accentColor.trim() : null,
      },
    };
    // send as patch (server merges)
    return patch as any;
  }, [accentColor, headerSubtitle, headerTitle]);

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label className="text-xs font-semibold text-slate-700">Formularname</label>
          <input
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-700">Status</label>
          <select
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            value={draftStatus}
            onChange={(e) => setDraftStatus(e.target.value as any)}
          >
            <option value="DRAFT">Entwurf</option>
            <option value="ACTIVE">Aktiv</option>
            <option value="ARCHIVED">Archiviert</option>
          </select>
          <div className="mt-1 text-xs text-slate-600">Hinweis: Aktiv bedeutet, dass das Formular in der App genutzt werden kann.</div>
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold text-slate-700">Beschreibung (optional)</label>
        <input
          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          value={draftDesc}
          onChange={(e) => setDraftDesc(e.target.value)}
          placeholder="Kurzbeschreibung für die Vorschau"
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="text-sm font-semibold text-slate-900">UI (Vorschau/App)</div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="text-xs font-semibold text-slate-700">Header Titel (optional)</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              value={headerTitle}
              onChange={(e) => setHeaderTitle(e.target.value)}
              placeholder="Wenn leer: Formularname"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700">Header Untertitel (optional)</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              value={headerSubtitle}
              onChange={(e) => setHeaderSubtitle(e.target.value)}
              placeholder="Wenn leer: Beschreibung"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700">Accent Color (optional)</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
              placeholder="#E11D48"
            />
            <div className="mt-1 text-xs text-slate-600">Wird z.B. für Sternebewertung genutzt (wenn gesetzt).</div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <button
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          disabled={busy}
          onClick={async () => {
            // Status separat patchen (damit klar)
            if (draftStatus !== status) await onPatchStatus(draftStatus);

            const baseCfg = (config ?? {}) as any;
            const merged = mergeDeep(baseCfg, configPatch);
            await onPatchBasics({
              name: draftName.trim(),
              description: draftDesc.trim() ? draftDesc.trim() : null,
              configPatch: merged,
            });
          }}
        >
          Speichern
        </button>
      </div>
    </div>
  );
}
