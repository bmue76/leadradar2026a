import { headers, cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { EventCommandHeader } from "./_components/EventCommandHeader";
import { PerformanceSnapshotToday } from "./_components/PerformanceSnapshotToday";
import { ActivityFeed } from "./_components/ActivityFeed";
import { getCommandCenterData } from "./_lib/commandCenterData";

export const dynamic = "force-dynamic";

function relLabel(iso: string | null, nowIso: string): string {
  if (!iso) return "—";
  const now = new Date(nowIso).getTime();
  const t = new Date(iso).getTime();
  const diffMs = Math.max(0, now - t);
  const sec = Math.floor(diffMs / 1000);
  if (sec < 30) return "gerade eben";
  const min = Math.floor(sec / 60);
  if (min < 60) return `vor ${min} Min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `vor ${hr} Std`;
  const days = Math.floor(hr / 24);
  return `vor ${days} Tg`;
}

function firstNonEmpty(...vals: Array<string | null | undefined>): string {
  for (const v of vals) {
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return "";
}

async function resolveTenantIdFromRequestContext(): Promise<{ tenantId: string; hint: string }> {
  const h = await headers();
  const c = await cookies();

  const headerTenantId = h.get("x-tenant-id");
  const headerTenantSlug = h.get("x-tenant-slug");

  const cookieTenantId = firstNonEmpty(
    c.get("x-tenant-id")?.value,
    c.get("tenantId")?.value,
    c.get("tenant_id")?.value,
    c.get("lr-tenant-id")?.value,
    c.get("leadradar_tenant_id")?.value
  );

  const cookieTenantSlug = firstNonEmpty(
    c.get("x-tenant-slug")?.value,
    c.get("tenantSlug")?.value,
    c.get("tenant_slug")?.value,
    c.get("lr-tenant-slug")?.value,
    c.get("leadradar_tenant_slug")?.value
  );

  const tenantId = firstNonEmpty(headerTenantId, cookieTenantId);
  const tenantSlug = firstNonEmpty(headerTenantSlug, cookieTenantSlug);

  if (tenantId) {
    return { tenantId, hint: headerTenantId ? "tenantId via header" : "tenantId via cookie" };
  }

  if (tenantSlug) {
    const t = await prisma.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true } });
    if (t?.id) {
      return {
        tenantId: t.id,
        hint: (headerTenantSlug ? "tenantSlug via header" : "tenantSlug via cookie") + " → tenantId via DB",
      };
    }
    return { tenantId: "", hint: `tenantSlug present (${tenantSlug}) but not found in DB` };
  }

  return { tenantId: "", hint: "missing tenant context: no x-tenant-id/x-tenant-slug in headers or cookies" };
}

export default async function AdminHomePage() {
  const { tenantId, hint } = await resolveTenantIdFromRequestContext();

  if (!tenantId) {
    return (
      <div className="mx-auto w-full max-w-5xl px-6 py-6">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">Event Übersicht</h1>
          <p className="mt-1 text-sm text-slate-600">Operatives Cockpit für das laufende Event.</p>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="text-sm font-medium text-slate-900">Tenant context required</div>
          <div className="mt-1 text-sm text-slate-600">
            Missing <code className="rounded bg-slate-100 px-1">x-tenant-id</code> /{" "}
            <code className="rounded bg-slate-100 px-1">x-tenant-slug</code> in headers or cookies.
          </div>
          <div className="mt-3 text-xs text-slate-500">Hint: {hint}</div>
          <div className="mt-3 text-xs text-slate-500">
            Fix: Ensure tenant context is persisted (cookie) or injected (middleware) for page requests.
          </div>
        </section>
      </div>
    );
  }

  const data = await getCommandCenterData(tenantId);

  const primaryCta =
    data.state === "NO_ACTIVE_EVENT"
      ? ({ label: "Event erstellen", href: "/admin/events" } as const)
      : data.state === "ACTIVE_NO_DEVICES"
        ? ({ label: "Gerät verbinden", href: "/admin/devices" } as const)
        : ({ label: "Event öffnen", href: data.event ? `/admin/events/${data.event.id}` : "/admin/events" } as const);

  const eventName = data.event?.name ?? (data.state === "NO_ACTIVE_EVENT" ? "Kein aktives Event" : "Aktives Event");

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">Event Übersicht</h1>
        <p className="mt-1 text-sm text-slate-600">Operatives Cockpit für das laufende Event.</p>
      </header>

      <EventCommandHeader
        eventName={eventName}
        status={data.status}
        leadsToday={data.leadsToday}
        summary={{
          activeDevices: data.activeDevices,
          activeForms: data.activeForms,
          lastActivityLabel: relLabel(data.lastActivityIso, data.nowIso),
        }}
        primaryCta={primaryCta}
      />

      <PerformanceSnapshotToday
        leadsToday={data.leadsToday}
        withCardToday={data.withCardToday}
        exportsToday={data.exportsToday}
        leadsPerHour={data.leadsPerHour}
      />

      <ActivityFeed items={data.activity} />
    </div>
  );
}
