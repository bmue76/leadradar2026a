import { Suspense } from "react";

import LeadsClient from "./LeadsClient";

function LoadingCard() {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="animate-pulse space-y-3">
        <div className="h-4 w-48 rounded bg-slate-100" />
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
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">Leads</h1>
        <p className="mt-1 text-sm text-slate-600">
          Nachbearbeitung der erfassten Leads. Standardmässig ist die Liste auf das{" "}
          <span className="font-semibold">aktive Event</span> gefiltert.
        </p>
      </header>

      <Suspense fallback={<LoadingCard />}>
        <LeadsClient />
      </Suspense>
    </div>
  );
}
