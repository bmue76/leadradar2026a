import { Suspense } from "react";
import LeadsClient from "./LeadsClient";

function LoadingCard() {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="text-sm text-slate-600">Lade…</div>
    </section>
  );
}

export default function AdminLeadsPage() {
  return (
    <div className="p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">Leads</h1>
        <p className="mt-1 text-sm text-slate-600">
          Alle Leads zentral verwalten, exportieren, per E-Mail weiterleiten oder als PDF-Rapport teilen.
        </p>
      </header>

      <Suspense fallback={<LoadingCard />}>
        <LeadsClient />
      </Suspense>
    </div>
  );
}
