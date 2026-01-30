import { Suspense } from "react";
import DevicesScreenClient from "./DevicesScreenClient";

function LoadingCard() {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="text-sm text-slate-600">Lade…</div>
    </section>
  );
}

export default function Page() {
  return (
    <div className="p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">Geräte</h1>
        <p className="mt-1 text-sm text-slate-600">Verbundene Geräte, Status, Event-Bind und Provisioning.</p>
      </header>

      <Suspense fallback={<LoadingCard />}>
        <DevicesScreenClient />
      </Suspense>
    </div>
  );
}
