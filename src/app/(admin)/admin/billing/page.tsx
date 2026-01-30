import { Suspense } from "react";
import BillingScreenClient from "./BillingScreenClient";

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
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">Abrechnung</h1>
        <p className="mt-1 text-sm text-slate-600">Lizenz, Credits und Gutscheine.</p>
      </header>

      <Suspense fallback={<LoadingCard />}>
        <BillingScreenClient />
      </Suspense>
    </div>
  );
}
