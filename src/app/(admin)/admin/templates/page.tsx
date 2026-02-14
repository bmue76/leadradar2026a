import React, { Suspense } from "react";
import { TemplatesScreenClient } from "./TemplatesScreenClient";

function PageFallback() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="h-5 w-44 animate-pulse rounded bg-slate-200" />
      <div className="mt-3 h-4 w-72 animate-pulse rounded bg-slate-200" />
      <div className="mt-6 space-y-2">
        <div className="h-4 w-full animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-11/12 animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-10/12 animate-pulse rounded bg-slate-200" />
      </div>
    </div>
  );
}

export default function TemplatesPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">Vorlagen</h1>
          <p className="mt-1 text-sm text-slate-600">Starte mit einer Vorlage und passe sie im Builder an.</p>
        </div>

        <Suspense fallback={<PageFallback />}>
          <TemplatesScreenClient />
        </Suspense>
      </div>
    </div>
  );
}
