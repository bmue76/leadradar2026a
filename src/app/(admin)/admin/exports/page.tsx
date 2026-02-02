import { Suspense } from "react";
import Link from "next/link";

import ExportsScreenClient from "./ExportsScreenClient";

function LoadingCard() {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-6">
      <div className="text-sm font-medium text-neutral-900">Exports</div>
      <div className="mt-2 text-sm text-neutral-600">Lade…</div>
    </section>
  );
}

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Exports</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Exportiere Leads als CSV (GoLive MVP: Online-only). Standard ist das aktive Event.
        </p>
        <div className="mt-3 text-sm text-neutral-600">Tipp: Filter setzen, exportieren, dann in Excel/CRM importieren.</div>
      </div>

      <Suspense fallback={<LoadingCard />}>
        <ExportsScreenClient
          initialDefaults={{
            scope: "ACTIVE_EVENT",
            leadStatus: "ALL",
            q: "",
          }}
          eventsLinkHref="/admin/events"
        />
      </Suspense>

      <div className="mt-8 border-t border-neutral-200 pt-4 text-xs text-neutral-500">
        <span className="mr-2">Need help?</span>
        <Link className="underline hover:text-neutral-700" href="/admin/leads">
          Zu Leads
        </Link>
      </div>
    </div>
  );
}
