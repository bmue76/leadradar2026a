import * as React from "react";
import type { BuilderField } from "../builder.types";
import IPhonePreviewFrame from "./IPhonePreviewFrame";
import PreviewFieldRenderer from "./PreviewFieldRenderer";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function pickUiTitle(formName: string, config: unknown): { title: string; subtitle?: string } {
  const baseTitle = formName || "Form";
  if (!isRecord(config)) return { title: baseTitle };
  const ui = config.ui;
  if (!isRecord(ui)) return { title: baseTitle };
  const header = ui.header;
  if (!isRecord(header)) return { title: baseTitle };
  const t = typeof header.title === "string" && header.title.trim() ? header.title.trim() : baseTitle;
  const s = typeof header.subtitle === "string" && header.subtitle.trim() ? header.subtitle.trim() : undefined;
  return { title: t, ...(s ? { subtitle: s } : {}) };
}

function pickAccent(config: unknown): string | null {
  if (!isRecord(config)) return null;
  const ui = config.ui;
  if (!isRecord(ui)) return null;
  const c = ui.accentColor;
  if (typeof c === "string" && /^#[0-9A-Fa-f]{6}$/.test(c.trim())) return c.trim();
  return null;
}

export default function BuilderPreviewPanel(props: {
  formName: string;
  formDescription: string | null;
  formConfig: unknown | null;
  fields: BuilderField[];
}) {
  const activeFields = React.useMemo(() => props.fields.filter((f) => !!f.isActive), [props.fields]);
  const header = React.useMemo(() => pickUiTitle(props.formName, props.formConfig), [props.formName, props.formConfig]);
  const accent = React.useMemo(() => pickAccent(props.formConfig), [props.formConfig]);

  return (
    <div className="w-full">
      <IPhonePreviewFrame>
        <div className="px-4 pb-6 pt-5">
          <div className="mb-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">LeadRadar</div>
            <div className="mt-1 text-xl font-semibold text-slate-900">{header.title}</div>
            {header.subtitle ? <div className="mt-1 text-sm text-slate-600">{header.subtitle}</div> : null}
            {props.formDescription ? <div className="mt-2 text-sm text-slate-500">{props.formDescription}</div> : null}
            <div className="mt-4 h-px w-full bg-slate-100" />
            {accent ? <div className="mt-3 h-1 w-16 rounded-full" style={{ backgroundColor: accent }} /> : null}
          </div>

          <div className="flex flex-col gap-3">
            {activeFields.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                No active fields. Enable fields in Build mode.
              </div>
            ) : (
              activeFields.map((f) => <PreviewFieldRenderer key={f.id} field={f} />)
            )}
          </div>

          <div className="mt-6">
            <button
              type="button"
              disabled
              className="h-12 w-full rounded-xl bg-slate-900 text-sm font-semibold text-white opacity-60"
            >
              Submit (disabled in preview)
            </button>
            <div className="mt-2 text-center text-xs text-slate-400">Preview is read-only — no data is saved.</div>
          </div>
        </div>
      </IPhonePreviewFrame>
    </div>
  );
}