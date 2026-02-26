import { Suspense } from "react";
import StatistikClient from "./StatistikClient";

export const dynamic = "force-dynamic";

function LoadingCard() {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="text-sm text-slate-600">Lade…</div>
    </section>
  );
}

export default function StatistikPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-6">
      <header className="mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">Performance</h1>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          Messe Performance Center für Peak-Zeiten, Geräte-Performance und Lead-Qualität.
        </p>
      </header>

      <Suspense fallback={<LoadingCard />}>
        <StatistikClient />
      </Suspense>
    </div>
  );
}
