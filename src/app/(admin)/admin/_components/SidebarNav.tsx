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

function IconOrganisation(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M6.5 20V6.8A2.3 2.3 0 0 1 8.8 4.5H14a2.3 2.3 0 0 1 2.3 2.3V20"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M5 20h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path
        d="M9 8.5h2.4M9 12h2.4M9 15.5h2.4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        opacity="0.85"
      />
    </svg>
  );
}

const NAV: NavGroup[] = [
  {
    key: "start",
    title: "Übersicht",
    Icon: IconHome,
    items: [{ href: "/admin", label: "Übersicht", exact: true }],
  },
  {
    key: "setup",
    title: "Vorbereitung",
    Icon: IconSetup,
    items: [
      { href: "/admin/templates", label: "Vorlagen" },
      { href: "/admin/forms", label: "Formulare" },
      { href: "/admin/settings/branding", label: "Branding" },
    ],
  },
  {
    // TP7.4: “Betrieb” → “Einsatz” → TP8.4: “Messen”
    key: "messen",
    title: "Messen",
    Icon: IconOperations,
    items: [
      { href: "/admin/events", label: "Messen & Events" },
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
    key: "auswertung",
    title: "Auswertung",
    Icon: IconStats,
    items: [
      { href: "/admin/statistik", label: "Performance" },
      { href: "/admin/reports/executive", label: "Executive Bericht (Beta)" },
    ],
  },
  {
    key: "billing",
    title: "Abrechnung",
    Icon: IconBilling,
    items: [
      { href: "/admin/licenses", label: "Lizenzübersicht", exact: true },
      { href: "/admin/billing/accounting", label: "Firma & Belege" },
    ],
  },
  {
    key: "org",
    title: "Organisation",
    Icon: IconOrganisation,
    items: [
      { href: "/admin/organisation", label: "Übersicht", exact: true },
      { href: "/admin/organisation/mandant", label: "Mandant" },
      { href: "/admin/organisation/transfer", label: "Mandant übertragen" },
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

            <div id={`nav-group-${group.key}`} className={["mt-1", isOpen ? "block" : "hidden"].join(" ")}>
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
