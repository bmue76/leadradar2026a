import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";

import { SidebarNav } from "./SidebarNav";
import { IconChevronDown, IconSettings, IconLogoMark } from "./icons";

type AdminShellProps = {
  children: ReactNode;
};

export function AdminShell({ children }: AdminShellProps) {
  // ONLINE-only MVP: Placeholders. Später via tenant-scoped APIs ersetzen.
  const tenantName = "Atlex GmbH";
  const userName = "Beat";

  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* Topbar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-4 px-4">
          {/* Brand (left) */}
          <Link
            href="/admin"
            className="flex items-center gap-2 rounded-md px-2 py-1 text-sm font-semibold hover:bg-slate-100"
            aria-label="LeadRadar Admin"
          >
            <span className="grid size-8 place-items-center rounded-full border border-slate-200 bg-slate-50">
              <IconLogoMark className="size-4 text-slate-700" />
            </span>
            <span className="text-base">LeadRadar Admin</span>
          </Link>

          <div className="flex-1" />

          {/* Tenant (center/right) */}
          <button
            type="button"
            className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 md:flex"
            aria-label="Tenant auswählen (Placeholder)"
          >
            <span className="grid size-7 place-items-center rounded-full border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700">
              A
            </span>
            <span className="font-medium">{tenantName}</span>
            <IconChevronDown className="size-4 text-slate-500" />
          </button>

          {/* User (right) */}
          <button
            type="button"
            className="flex items-center gap-2 rounded-full border border-transparent bg-white px-2 py-2 text-sm hover:border-slate-200 hover:bg-slate-50"
            aria-label="User-Menü (Placeholder)"
          >
            <span className="hidden font-medium text-slate-700 sm:inline">{userName}</span>
            <IconChevronDown className="hidden size-4 text-slate-500 sm:inline" />
            <span className="grid size-8 place-items-center rounded-full border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700">
              B
            </span>
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="mx-auto flex w-full max-w-[1400px]">
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-[260px] shrink-0 border-r border-slate-200 bg-slate-50/40 md:block">
          <div className="flex h-full flex-col">
            <div className="px-3 py-3">
              <SidebarNav />
            </div>

            {/* Sticky bottom: Settings + Footer */}
            <div className="mt-auto border-t border-slate-200 px-3 py-3">
              <Link
                href="/admin/settings"
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
              >
                <IconSettings className="size-4 text-slate-600" />
                <span>Einstellungen</span>
              </Link>

              <div className="mt-3 px-3">
                <div className="text-[11px] text-slate-500">Powered by</div>
                <div className="mt-1">
                  <Image
                    src="/brand/leadradar-logo.png"
                    alt="LeadRadar"
                    width={140}
                    height={32}
                    className="h-5 w-auto opacity-80"
                    priority={false}
                  />
                </div>
              </div>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
