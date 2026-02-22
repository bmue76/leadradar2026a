import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ApiOk<T> = { ok: true; data: T; traceId: string };
type ApiErr = { ok: false; error: { code: string; message: string; details?: unknown }; traceId: string };

function traceId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function jsonOk<T>(data: T, tid: string): Response {
  const body: ApiOk<T> = { ok: true, data, traceId: tid };
  return NextResponse.json(body, { status: 200, headers: { "x-trace-id": tid } });
}

function jsonError(code: string, message: string, tid: string, status = 400, details?: unknown): Response {
  const body: ApiErr = { ok: false, error: { code, message, details }, traceId: tid };
  return NextResponse.json(body, { status, headers: { "x-trace-id": tid } });
}

function requireTenant(req: NextRequest, tid: string): { ok: true; tenantId: string } | { ok: false; res: Response } {
  const tenantId = req.headers.get("x-tenant-id") || "";
  if (!tenantId) return { ok: false, res: jsonError("TENANT_CONTEXT_REQUIRED", "Missing x-tenant-id.", tid, 401) };
  return { ok: true, tenantId };
}

type DeviceItem = {
  id: string;
  name: string;
  lastSeenAt: string | null;
  activeLicense: null | { type: "FAIR_30D" | "YEAR_365D"; endsAt: string };
  pendingCount: number;
  pendingNextType: "FAIR_30D" | "YEAR_365D" | null;
};

type HistoryItem = {
  id: string;
  deviceId: string;
  deviceName: string;
  type: "FAIR_30D" | "YEAR_365D";
  status: "ACTIVE" | "REVOKED";
  state: "ACTIVE" | "EXPIRED" | "PENDING_ACTIVATION" | "REVOKED";
  startsAt: string;
  endsAt: string;
  createdAt: string;
  source: "STRIPE" | "MANUAL";
  note: string | null;
};

export async function GET(req: NextRequest): Promise<Response> {
  const tid = traceId();
  const tenant = requireTenant(req, tid);
  if (!tenant.ok) return tenant.res;

  const now = new Date();

  const devices = await prisma.mobileDevice.findMany({
    where: { tenantId: tenant.tenantId, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      lastSeenAt: true,
    },
  });

  const deviceIds = devices.map((d) => d.id);

  const activeLicenses = deviceIds.length
    ? await prisma.deviceLicense.findMany({
        where: {
          tenantId: tenant.tenantId,
          deviceId: { in: deviceIds },
          status: "ACTIVE",
          endsAt: { gt: now },
          note: { not: "stripe_pending" },
        },
        orderBy: { endsAt: "desc" },
        select: { deviceId: true, type: true, endsAt: true },
      })
    : [];

  const activeByDeviceId = new Map<string, { type: "FAIR_30D" | "YEAR_365D"; endsAt: string }>();
  for (const l of activeLicenses) {
    if (!activeByDeviceId.has(l.deviceId)) activeByDeviceId.set(l.deviceId, { type: l.type, endsAt: l.endsAt.toISOString() });
  }

  const pendingRows = deviceIds.length
    ? await prisma.deviceLicense.findMany({
        where: { tenantId: tenant.tenantId, deviceId: { in: deviceIds }, status: "ACTIVE", note: "stripe_pending" },
        orderBy: { createdAt: "asc" },
        select: { deviceId: true, type: true },
      })
    : [];

  const pendingByDeviceId = new Map<string, { count: number; nextType: "FAIR_30D" | "YEAR_365D" | null }>();
  for (const p of pendingRows) {
    const cur = pendingByDeviceId.get(p.deviceId) ?? { count: 0, nextType: null };
    cur.count += 1;
    if (!cur.nextType) cur.nextType = p.type;
    pendingByDeviceId.set(p.deviceId, cur);
  }

  const deviceItems: DeviceItem[] = devices.map((d) => ({
    id: d.id,
    name: d.name,
    lastSeenAt: d.lastSeenAt ? d.lastSeenAt.toISOString() : null,
    activeLicense: activeByDeviceId.get(d.id) ?? null,
    pendingCount: pendingByDeviceId.get(d.id)?.count ?? 0,
    pendingNextType: pendingByDeviceId.get(d.id)?.nextType ?? null,
  }));

  const history = await prisma.deviceLicense.findMany({
    where: { tenantId: tenant.tenantId },
    orderBy: { createdAt: "desc" },
    take: 250,
    select: {
      id: true,
      deviceId: true,
      type: true,
      status: true,
      startsAt: true,
      endsAt: true,
      createdAt: true,
      note: true,
      stripeCheckoutSessionId: true,
      device: { select: { name: true } },
    },
  });

  const historyItems: HistoryItem[] = history.map((h) => {
    const isPending = h.note === "stripe_pending";
    const isRevoked = h.status === "REVOKED";
    const isExpired = !isPending && !isRevoked && h.endsAt.getTime() <= now.getTime();

    const state: HistoryItem["state"] = isRevoked
      ? "REVOKED"
      : isPending
        ? "PENDING_ACTIVATION"
        : isExpired
          ? "EXPIRED"
          : "ACTIVE";

    const source: HistoryItem["source"] = h.stripeCheckoutSessionId ? "STRIPE" : "MANUAL";

    return {
      id: h.id,
      deviceId: h.deviceId,
      deviceName: h.device.name,
      type: h.type,
      status: h.status,
      state,
      startsAt: h.startsAt.toISOString(),
      endsAt: h.endsAt.toISOString(),
      createdAt: h.createdAt.toISOString(),
      source,
      note: h.note,
    };
  });

  return jsonOk({ now: now.toISOString(), devices: deviceItems, history: historyItems }, tid);
}
