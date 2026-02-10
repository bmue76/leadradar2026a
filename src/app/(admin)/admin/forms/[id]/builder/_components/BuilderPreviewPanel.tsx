"use client";

import React, { useMemo } from "react";
import type { BuilderField } from "../builder.types";
import IPhonePreviewFrame from "./IPhonePreviewFrame";
import PreviewFieldRenderer from "./PreviewFieldRenderer";

function pickUiTitle(formName: string, formConfig: Record<string, unknown> | null): string {
  const cfg = (formConfig ?? {}) as any;
  return (cfg?.ui?.header?.title as string) || formName || "Formular";
}

function pickUiSubtitle(formDescription: string | null, formConfig: Record<string, unknown> | null): string | null {
  const cfg = (formConfig ?? {}) as any;
  const v = (cfg?.ui?.header?.subtitle as string) ?? null;
  return v ?? formDescription ?? null;
}

function pickAccent(formConfig: Record<string, unknown> | null): string | null {
  const cfg = (formConfig ?? {}) as any;
  return (cfg?.ui?.accentColor as string) ?? null;
}

export default function BuilderPreviewPanel({
  formName,
  formDescription,
  formConfig,
  fields,
}: {
  formName: string;
  formDescription: string | null;
  formConfig: Record<string, unknown> | null;
  fields: BuilderField[];
}) {
  const title = pickUiTitle(formName, formConfig);
  const subtitle = pickUiSubtitle(formDescription, formConfig);
  const accent = pickAccent(formConfig);

  const activeFields = useMemo(() => fields.filter((f) => f.isActive), [fields]);

  return (
    <IPhonePreviewFrame>
      <div className="px-4 pb-5 pt-6">
        <div className="text-center">
          <div className="text-lg font-semibold text-slate-900">{title}</div>
          {subtitle ? <div className="mt-1 text-sm text-slate-600">{subtitle}</div> : null}
        </div>

        <div className="mt-5 grid gap-3">
          {activeFields.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-700">
              Keine aktiven Felder. Aktiviere rechts Felder oder fuege neue hinzu.
            </div>
          ) : (
            activeFields.map((f) => <PreviewFieldRenderer key={f.id} field={f} accent={accent} />)
          )}
        </div>

        <button
          className="mt-5 w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white opacity-70"
          disabled
        >
          Absenden (in Vorschau deaktiviert)
        </button>

        <div className="mt-3 text-center text-xs text-slate-500">Powered by LeadRadar</div>
      </div>
    </IPhonePreviewFrame>
  );
}
