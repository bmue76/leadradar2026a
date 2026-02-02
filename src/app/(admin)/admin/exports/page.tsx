import Link from "next/link";

import ExportsScreenClient from "./ExportsScreenClient";

type SearchParams = Record<string, string | string[] | undefined>;

function pickFirst(v: string | string[] | undefined): string | undefined {
  if (!v) return undefined;
  if (Array.isArray(v)) return v[0];
  return v;
}

export default function Page(props: { searchParams?: SearchParams }) {
  const sp = props.searchParams ?? {};

  const scope = pickFirst(sp.scope);
  const leadStatus = pickFirst(sp.leadStatus);
  const q = pickFirst(sp.q);

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Exports</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Exportiere Leads als CSV (GoLive MVP: Online-only). Standard ist das aktive Event.
        </p>
        <div className="mt-3 text-sm text-neutral-600">
          Tipp: Filter setzen, exportieren, dann in Excel/CRM importieren.
        </div>
      </div>

      <ExportsScreenClient
        initialDefaults={{
          scope: scope === "ALL" || scope === "ACTIVE_EVENT" ? scope : "ACTIVE_EVENT",
          leadStatus: leadStatus === "ALL" || leadStatus === "NEW" || leadStatus === "REVIEWED" ? leadStatus : "ALL",
          q: q ?? "",
        }}
        eventsLinkHref="/admin/events"
      />

      <div className="mt-8 border-t border-neutral-200 pt-4 text-xs text-neutral-500">
        <span className="mr-2">Need help?</span>
        <Link className="underline hover:text-neutral-700" href="/admin/leads">
          Zu Leads
        </Link>
      </div>
    </div>
  );
}
