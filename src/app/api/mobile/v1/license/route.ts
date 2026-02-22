import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "node:crypto";
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

function env(name: string): string {
  return (process.env[name] || "").trim();
}

function hmacKeyHash(apiKeyPlain: string): string {
  const secret = env("MOBILE_API_KEY_SECRET");
  if (!secret) throw new Error("Missing MOBILE_API_KEY_SECRET.");
  return createHmac("sha256", secret).update(apiKeyPlain).digest("hex");
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

function durationDays(type: string): number | null {
  if (type === "FAIR_30D") return 30;
  if (type === "YEAR_365D") return 365;
  return null;
}

export async function GET(req: NextRequest): Promise<Response> {
  const tid = traceId();

  const apiKey = (req.headers.get("x-api-key") || req.headers.get("x-mobile-api-key") || "").trim();
  if (!apiKey) return jsonError("UNAUTHORIZED", "Unauthorized.", tid, 401);

  let keyHash: string;
  try {
    keyHash = hmacKeyHash(apiKey);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Config error.";
    return jsonError("CONFIG_ERROR", msg, tid, 500);
  }

  const key = await prisma.mobileApiKey.findFirst({
    where: { keyHash, status: "ACTIVE" },
    select: {
      id: true,
      tenantId: true,
      device: { select: { id: true } },
    },
  });

  if (!key?.device?.id) return jsonError("UNAUTHORIZED", "Unauthorized.", tid, 401);

  const tenantId = key.tenantId;
  const deviceId = key.device.id;
  const now = new Date();

  // Activate pending purchases on first app use (/license call)
  await prisma.$transaction(async (tx) => {
    // mark device seen
    await tx.mobileDevice.update({
      where: { id: deviceId },
      data: { lastSeenAt: now },
    });

    const pending = await tx.deviceLicense.findMany({
      where: {
        tenantId,
        deviceId,
        status: "ACTIVE",
        note: "stripe_pending",
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, type: true },
    });

    if (pending.length === 0) return;

    const current = await tx.deviceLicense.findFirst({
      where: {
        tenantId,
        deviceId,
        status: "ACTIVE",
        endsAt: { gt: now },
        note: { not: "stripe_pending" },
      },
      orderBy: { endsAt: "desc" },
      select: { endsAt: true },
    });

    let base = current?.endsAt && current.endsAt.getTime() > now.getTime() ? current.endsAt : now;

    for (const p of pending) {
      const days = durationDays(p.type);
      if (!days) continue;

      const startsAt = base;
      const endsAt = addDays(base, days);

      await tx.deviceLicense.update({
        where: { id: p.id },
        data: {
          startsAt,
          endsAt,
          note: "stripe_activated",
        },
      });

      base = endsAt;
    }
  });

  const lic = await prisma.deviceLicense.findFirst({
    where: {
      tenantId,
      deviceId,
      status: "ACTIVE",
      endsAt: { gt: now },
      note: { not: "stripe_pending" },
    },
    orderBy: { endsAt: "desc" },
    select: { endsAt: true, type: true },
  });

  return jsonOk(
    {
      isActive: Boolean(lic),
      endsAt: lic ? lic.endsAt.toISOString() : null,
      type: lic ? lic.type : null,
    },
    tid
  );
}
