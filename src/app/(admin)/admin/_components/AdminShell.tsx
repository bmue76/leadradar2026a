import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";

import { SidebarNav } from "./SidebarNav";
import { SidebarLogoutButton } from "./SidebarLogoutButton";
import { TenantTopbarBranding } from "./TenantTopbarBranding";
import { AdminAccentProvider } from "./AdminAccentProvider";

type AdminShellProps = {
  children: ReactNode;
};

function IconSettingsNice(props: React.SVGProps<SVGSVGElement>) {
  // Sliders / controls – cleaner than a dense gear
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M4 7h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M18 7h2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M14 7a2 2 0 1 1 0 .01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />

      <path d="M4 12h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M14 12h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M10 12a2 2 0 1 1 0 .01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />

      <path d="M4 17h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M20 17h0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M18 17a2 2 0 1 1 0 .01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function AdminShell({ children }: AdminShellProps) {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* Accent tokens (CSS vars on :root) */}
      <AdminAccentProvider />

      {/* Topbar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-[1400px] items-center">
          {/* Left column (aligns to sidebar width on md+) */}
          <div className="flex items-center px-4 md:w-[260px] md:px-4">
            <Link
              href="/admin"
              className="flex items-center gap-2 rounded-md px-2 py-1 text-sm font-semibold hover:bg-slate-100"
              aria-label="LeadRadar Admin"
            >
              <Image
                src="/brand/leadradar-icon.png"
                alt="LeadRadar"
                width={28}
                height={28}
                className="h-7 w-7"
                priority={false}
              />
              <span className="text-base font-semibold">LeadRadar Admin</span>

              {/* subtle accent dot */}
              <span
                className="ml-1 inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: "var(--lr-accent)" }}
                aria-hidden="true"
              />
            </Link>
          </div>

          {/* Main column (aligned to page content wrapper: max-w-5xl px-6) */}
          <div className="min-w-0 flex-1">
            <div className="mx-auto w-full max-w-5xl px-6">
              <TenantTopbarBranding />
            </div>
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="mx-auto flex w-full max-w-[1400px]">
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-[260px] shrink-0 border-r border-slate-200 bg-slate-50/40 md:block">
          <div className="flex h-full flex-col">
            <div className="px-3 py-3">
              <SidebarNav />
            </div>

            {/* Sticky bottom: Organisation + Logout + Footer */}
            <div className="mt-auto border-t border-slate-200 px-3 py-3">
              <Link
                href="/admin/settings"
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
              >
                <IconSettingsNice className="size-4 text-slate-600" />
                <span>Organisation</span>
              </Link>

              <div className="mt-1">
                <SidebarLogoutButton />
              </div>

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

        {/* ✅ Kein Padding hier – Pages machen mx-auto max-w-5xl px-6 py-6 */}
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
