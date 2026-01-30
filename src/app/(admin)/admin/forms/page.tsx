import { Suspense } from "react";

import { FormsScreenClient } from "./FormsScreenClient";

function LoadingList() {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="animate-pulse space-y-3">
        <div className="h-4 w-40 rounded bg-slate-100" />
        <div className="h-10 w-full rounded bg-slate-100" />
        <div className="h-10 w-full rounded bg-slate-100" />
        <div className="h-10 w-full rounded bg-slate-100" />
      </div>
    </section>
  );
}

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">Formulare</h1>
        <p className="mt-1 text-sm text-slate-600">
          Erstelle Formulare und weise sie dem aktiven Event zu. Mobile zeigt nur{" "}
          <span className="font-semibold">ACTIVE</span> Formulare, die dem aktiven Event zugewiesen sind.
        </p>
      </header>

      <Suspense fallback={<LoadingList />}>
        <FormsScreenClient />
      </Suspense>
    </div>
  );
}
