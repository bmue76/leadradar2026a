"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useEffect, useMemo, useState } from "react";

import {
  IconBilling,
  IconChevronDown,
  IconHome,
  IconLeads,
  IconOperations,
  IconSetup,
  IconStats,
} from "./icons";

type NavItem = {
  href: string;
  label: string;
};

type NavGroup = {
  key: string;
  title: string;
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  items: NavItem[];
};

const NAV: NavGroup[] = [
  {
    key: "start",
    title: "Start",
    Icon: IconHome,
    items: [{ href: "/admin", label: "Übersicht" }],
  },
  {
    key: "setup",
    title: "Setup",
    Icon: IconSetup,
    items: [
      { href: "/admin/templates", label: "Vorlagen" },
      { href: "/admin/forms", label: "Formulare" },
      { href: "/admin/branding", label: "Branding" },
    ],
  },
  {
    key: "betrieb",
    title: "Betrieb",
    Icon: IconOperations,
    items: [
      { href: "/admin/events", label: "Events" },
      { href: "/admin/devices", label: "Geräte" },
    ],
  },
  {
    key: "leads",
    title: "Leads",
    Icon: IconLeads,
    items: [
      { href: "/admin/leads", label: "Leads" },
      { href: "/admin/recipients", label: "Empfängerlisten" },
      { href: "/admin/exports", label: "Exporte" },
    ],
  },
  {
    key: "stats",
    title: "Statistik",
    Icon: IconStats,
    items: [{ href: "/admin/stats", label: "Statistik" }],
  },
  {
    key: "billing",
    title: "Abrechnung",
    Icon: IconBilling,
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

function findActiveGroupKey(pathname: string): string {
  for (const group of NAV) {
    for (const item of group.items) {
      if (isActivePath(pathname, item.href)) return group.key;
    }
  }
  return "start";
}

export function SidebarNav() {
  const pathname = usePathname() || "/admin";

  const activeGroupKey = useMemo(() => findActiveGroupKey(pathname), [pathname]);
  const [openKey, setOpenKey] = useState<string>(activeGroupKey);

  useEffect(() => {
    // Beim Routenwechsel: passende Kategorie automatisch öffnen
    setOpenKey(activeGroupKey);
  }, [activeGroupKey]);

  return (
    <nav className="flex flex-col gap-2" aria-label="Admin Navigation">
      {NAV.map((group) => {
        const isOpen = openKey === group.key;
        const isGroupActive = group.key === activeGroupKey;

        return (
          <div key={group.key} className="flex flex-col">
            <button
              type="button"
              onClick={() => setOpenKey((prev) => (prev === group.key ? "" : group.key))}
              className={[
                "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm",
                "hover:bg-slate-100",
                isGroupActive ? "bg-white text-slate-900" : "text-slate-700",
              ].join(" ")}
              aria-expanded={isOpen}
              aria-controls={`nav-group-${group.key}`}
            >
              <span
                className={[
                  "grid size-9 place-items-center rounded-xl border bg-white",
                  isGroupActive ? "border-blue-200" : "border-slate-200",
                ].join(" ")}
                aria-hidden="true"
              >
                <group.Icon className={["size-5", isGroupActive ? "text-blue-600" : "text-slate-700"].join(" ")} />
              </span>

              <span className={["flex-1 text-left font-medium", isGroupActive ? "text-slate-900" : ""].join(" ")}>
                {group.title}
              </span>

              <IconChevronDown
                className={[
                  "size-4 text-slate-500 transition-transform",
                  isOpen ? "rotate-180" : "rotate-0",
                ].join(" ")}
              />
            </button>

            <div
              id={`nav-group-${group.key}`}
              className={["mt-1 flex flex-col gap-1 pl-6", isOpen ? "block" : "hidden"].join(" ")}
            >
              {group.items.map((item) => {
                const active = isActivePath(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={[
                      "relative flex items-center rounded-lg px-3 py-2 text-sm",
                      active ? "bg-blue-50 text-slate-900" : "text-slate-700 hover:bg-slate-100",
                    ].join(" ")}
                    aria-current={active ? "page" : undefined}
                  >
                    <span
                      className={[
                        "absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full",
                        active ? "bg-blue-600" : "bg-transparent",
                      ].join(" ")}
                      aria-hidden="true"
                    />
                    <span className="pl-2">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );
}
