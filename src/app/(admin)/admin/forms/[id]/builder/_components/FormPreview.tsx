"use client";

import React from "react";
import type { BuilderField } from "../builder.types";
import BuilderPreviewPanel from "./BuilderPreviewPanel";

export default function FormPreview({
  name,
  description,
  config,
  fields,
}: {
  name: string;
  description: string | null;
  config: Record<string, unknown> | null;
  fields: BuilderField[];
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="text-sm font-semibold text-slate-900">Vorschau</div>
      <div className="mt-3">
        <BuilderPreviewPanel formName={name} formDescription={description} formConfig={config} fields={fields} />
      </div>
    </section>
  );
}
