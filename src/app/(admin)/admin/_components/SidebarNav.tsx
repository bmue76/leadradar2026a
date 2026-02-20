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
  exact?: boolean;
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
    items: [{ href: "/admin", label: "Übersicht", exact: true }],
  },
  {
    key: "setup",
    title: "Setup",
    Icon: IconSetup,
    items: [
      { href: "/admin/templates", label: "Vorlagen" },
      { href: "/admin/forms", label: "Formulare" },
      { href: "/admin/settings/branding", label: "Branding" },
    ],
  },
  {
    // TP7.4: “Betrieb” → “Einsatz”
    key: "einsatz",
    title: "Einsatz",
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
      // Overview should NOT be active when user is in /admin/billing/*
      { href: "/admin/billing", label: "Übersicht", exact: true },
      { href: "/admin/billing/accounting", label: "Firma & Belege" },
    ],
  },
];

function isMatch(pathname: string, item: NavItem) {
  const href = item.href;

  if (item.exact) return pathname === href;

  return pathname === href || pathname.startsWith(href + "/");
}

/**
 * Longest-match active item:
 * - prevents multiple active items when one href is a prefix of another
 * - keeps UX stable for nested routes (/admin/x/[id], etc.)
 */
function findActive(pathname: string): { groupKey: string; href: string } | null {
  let best: { groupKey: string; href: string } | null = null;

  for (const group of NAV) {
    for (const item of group.items) {
      if (!isMatch(pathname, item)) continue;

      if (!best) {
        best = { groupKey: group.key, href: item.href };
        continue;
      }

      if (item.href.length > best.href.length) {
        best = { groupKey: group.key, href: item.href };
      }
    }
  }

  return best;
}

export function SidebarNav() {
  const pathname = usePathname() || "/admin";

  const active = useMemo(() => findActive(pathname), [pathname]);
  const activeGroupKey = active?.groupKey ?? "start";
  const activeHref = active?.href ?? null;

  const [openKey, setOpenKey] = useState<string>(activeGroupKey);

  useEffect(() => {
    setOpenKey(activeGroupKey);
  }, [activeGroupKey]);

  return (
    <nav className="flex flex-col gap-1.5" aria-label="Admin Navigation">
      {NAV.map((group) => {
        const isOpen = openKey === group.key;
        const isGroupActive = group.key === activeGroupKey;

        return (
          <div key={group.key} className="flex flex-col">
            <button
              type="button"
              onClick={() => setOpenKey((prev) => (prev === group.key ? "" : group.key))}
              className={[
                "group flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-sm",
                "hover:bg-slate-100",
                "focus:outline-none focus:ring-2 focus:ring-slate-200",
                isGroupActive ? "bg-white text-slate-900" : "text-slate-700",
              ].join(" ")}
              aria-expanded={isOpen}
              aria-controls={`nav-group-${group.key}`}
            >
              <span
                className={[
                  "grid size-9 place-items-center rounded-xl border bg-white",
                  isGroupActive ? "border-[color:var(--lr-accent-soft)]" : "border-slate-200",
                ].join(" ")}
                aria-hidden="true"
              >
                <group.Icon
                  className={[
                    "size-5",
                    isGroupActive ? "text-[color:var(--lr-accent)]" : "text-slate-700",
                  ].join(" ")}
                />
              </span>

              <span
                className={[
                  "flex-1 text-left font-medium",
                  isGroupActive ? "text-slate-900" : "",
                ].join(" ")}
              >
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
              className={["mt-1", isOpen ? "block" : "hidden"].join(" ")}
            >
              <div className="relative ml-6 border-l border-slate-200 pl-5">
                <div className="flex flex-col gap-1 py-1">
                  {group.items.map((item) => {
                    const activeItem = activeHref === item.href;

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={[
                          "relative flex items-center rounded-lg px-3 py-1.5 text-sm",
                          "focus:outline-none focus:ring-2 focus:ring-slate-200",
                          activeItem
                            ? "bg-[color:var(--lr-accent-soft)] text-slate-900"
                            : "text-slate-700 hover:bg-slate-100",
                        ].join(" ")}
                        aria-current={activeItem ? "page" : undefined}
                      >
                        <span
                          className={[
                            "absolute -left-[13px] top-1/2 size-2 -translate-y-1/2 rounded-full",
                            activeItem ? "bg-[color:var(--lr-accent)]" : "bg-slate-300",
                          ].join(" ")}
                          aria-hidden="true"
                        />
                        <span className="pl-1">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </nav>
  );
}
