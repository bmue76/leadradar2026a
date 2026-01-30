import { Suspense } from "react";

import { TemplatesScreenClient } from "./TemplatesScreenClient";

function LoadingGrid() {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="animate-pulse space-y-3">
        <div className="h-4 w-40 rounded bg-slate-100" />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={`sk_${i}`} className="rounded-2xl border border-slate-200 p-4">
              <div className="h-4 w-2/3 rounded bg-slate-100" />
              <div className="mt-3 h-3 w-1/2 rounded bg-slate-100" />
              <div className="mt-6 h-9 w-32 rounded bg-slate-100" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function Page() {
  return (
    <div className="p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">Vorlagen</h1>
        <p className="mt-1 text-sm text-slate-600">Starte mit einer Vorlage und passe sie im Builder an.</p>
      </header>

      <Suspense fallback={<LoadingGrid />}>
        <TemplatesScreenClient />
      </Suspense>
    </div>
  );
}
