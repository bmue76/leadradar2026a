import { Suspense } from "react";
import LicensesClient from "./LicensesClient";

function LoadingCard() {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="text-sm text-slate-600">Lade…</div>
    </section>
  );
}

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">Lizenzen</h1>
        <p className="mt-1 text-sm text-slate-600">Device-Lizenzen: Status pro Gerät und Historie aller Käufe/Aktivierungen.</p>
      </header>

      <Suspense fallback={<LoadingCard />}>
        <LicensesClient />
      </Suspense>
    </div>
  );
}
