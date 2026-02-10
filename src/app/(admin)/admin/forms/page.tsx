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
          Bereite dein Messeformular vor. Damit es in der App erscheint, muss es{" "}
          <span className="font-semibold">Aktiv</span> sein und dem <span className="font-semibold">aktiven Event</span>{" "}
          zugewiesen werden.
        </p>
      </header>

      <Suspense fallback={<LoadingList />}>
        <FormsScreenClient />
      </Suspense>
    </div>
  );
}
