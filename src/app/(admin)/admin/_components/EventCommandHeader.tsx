import Link from "next/link";
import type { CommandCenterPrimaryCta, CommandCenterStatus } from "../_lib/commandCenterData";

function StatusDot({ status }: { status: CommandCenterStatus }) {
  const dot =
    status === "LIVE"
      ? "bg-emerald-500"
      : status === "BEREIT"
        ? "bg-amber-500"
        : "bg-slate-300";

  return <span className={`inline-block h-2 w-2 rounded-full ${dot}`} aria-hidden />;
}

export function EventCommandHeader(props: {
  eventName: string;
  status: CommandCenterStatus;
  leadsToday: number;
  summary: { activeDevices: number; activeForms: number; lastActivityLabel: string };
  primaryCta: CommandCenterPrimaryCta;
}) {
  const { eventName, status, leadsToday, summary, primaryCta } = props;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-7">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <StatusDot status={status} />
            <span className="font-medium">{status}</span>
          </div>

          <h2 className="mt-2 truncate text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            {eventName}
          </h2>

          <div className="mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-2">
            <div>
              <div className="text-sm text-slate-600">Leads heute</div>
              <div className="text-4xl font-semibold tracking-tight text-slate-900">{leadsToday}</div>
            </div>

            <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-600">
              <span>
                <span className="text-slate-900">{summary.activeDevices}</span> Geräte aktiv
              </span>
              <span aria-hidden>·</span>
              <span>
                <span className="text-slate-900">{summary.activeForms}</span> Formulare aktiv
              </span>
              <span aria-hidden>·</span>
              <span>
                Letzte Aktivität: <span className="text-slate-900">{summary.lastActivityLabel}</span>
              </span>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 justify-start sm:justify-end">
          <Link
            href={primaryCta.href}
            className="inline-flex h-10 items-center justify-center rounded-full bg-slate-900 px-5 text-sm font-medium text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
          >
            {primaryCta.label}
          </Link>
        </div>
      </div>
    </section>
  );
}
