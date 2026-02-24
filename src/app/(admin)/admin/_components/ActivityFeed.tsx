import Link from "next/link";
import type { ActivityItem } from "../_lib/commandCenterData";

export function ActivityFeed(props: { items: ActivityItem[] }) {
  return (
    <section className="mt-6">
      <div className="mb-3 text-sm font-medium text-slate-900">Aktivität</div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {props.items.length === 0 ? (
          <div className="p-5 text-sm text-slate-600">Noch keine Aktivität.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {props.items.map((it, idx) => (
              <li key={`${it.kind}-${it.at}-${idx}`}>
                <Link
                  href={it.href}
                  className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-900">{it.title}</div>
                    <div className="truncate text-sm text-slate-600">{it.subtitle}</div>
                  </div>
                  <div className="text-slate-400" aria-hidden>
                    ›
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
