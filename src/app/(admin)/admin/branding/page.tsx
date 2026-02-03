import { Suspense } from "react";
import BrandingScreenClient from "./BrandingScreenClient";

function LoadingCard() {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="h-6 w-48 rounded bg-slate-100" />
      <div className="mt-2 h-4 w-96 rounded bg-slate-100" />
      <div className="mt-6 space-y-3">
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
      <Suspense fallback={<LoadingCard />}>
        <BrandingScreenClient />
      </Suspense>
    </div>
  );
}
