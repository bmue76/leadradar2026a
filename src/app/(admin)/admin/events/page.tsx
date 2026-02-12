import { Suspense } from "react";

import ScreenClient from "./ScreenClient";

function LoadingCard() {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="text-sm text-slate-600">Lade…</div>
    </section>
  );
}

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">Events</h1>
        <p className="mt-1 text-sm text-slate-600">
          Mehrere Events können aktiv sein. Die App arbeitet pro Gerät mit dem gebundenen Event (activeEventId).
        </p>
      </header>

      <Suspense fallback={<LoadingCard />}>
        <ScreenClient />
      </Suspense>
    </div>
  );
}
