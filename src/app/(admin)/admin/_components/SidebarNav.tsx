"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
};

type NavGroup = {
  title: string;
  items: NavItem[];
};

const NAV: NavGroup[] = [
  {
    title: "Start",
    items: [{ href: "/admin", label: "Übersicht" }],
  },
  {
    title: "Setup",
    items: [
      { href: "/admin/templates", label: "Vorlagen" },
      { href: "/admin/forms", label: "Formulare" },
      { href: "/admin/branding", label: "Branding" },
    ],
  },
  {
    title: "Betrieb",
    items: [
      { href: "/admin/events", label: "Events" },
      { href: "/admin/devices", label: "Geräte" },
      { href: "/admin/leads", label: "Leads" },
      { href: "/admin/recipients", label: "Empfängerlisten" },
      { href: "/admin/exports", label: "Exporte" },
    ],
  },
  {
    title: "Statistik",
    items: [{ href: "/admin/stats", label: "Statistik" }],
  },
  {
    title: "Abrechnung",
    items: [
      { href: "/admin/billing/packages", label: "Pakete" },
      { href: "/admin/billing/orders", label: "Bestellungen" },
      { href: "/admin/billing/licenses", label: "Lizenzen" },
    ],
  },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(href + "/");
}

export function SidebarNav() {
  const pathname = usePathname() || "/admin";

  return (
    <nav className="flex flex-col gap-4" aria-label="Admin Navigation">
      {NAV.map((group) => (
        <div key={group.title} className="flex flex-col gap-1">
          <div className="px-3 pb-1 pt-2 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
            {group.title}
          </div>

          <div className="flex flex-col gap-1">
            {group.items.map((item) => {
              const active = isActivePath(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[
                    "group relative flex items-center rounded-lg px-3 py-2 text-sm",
                    active ? "bg-blue-50 text-slate-900" : "text-slate-700 hover:bg-slate-100",
                  ].join(" ")}
                  aria-current={active ? "page" : undefined}
                >
                  {/* Left accent bar (active) */}
                  <span
                    className={[
                      "absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-full",
                      active ? "bg-blue-600" : "bg-transparent",
                    ].join(" ")}
                    aria-hidden="true"
                  />
                  <span className="pl-1">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
