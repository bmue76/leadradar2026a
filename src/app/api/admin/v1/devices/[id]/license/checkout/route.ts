import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  type: z.enum(["FAIR_30D", "YEAR_365D"]),
});

function traceId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function jsonOk(data: unknown, tid: string): Response {
  return NextResponse.json(
    { ok: true, data, traceId: tid },
    { status: 200, headers: { "x-trace-id": tid } }
  );
}

function jsonError(code: string, message: string, tid: string, status = 400): Response {
  return NextResponse.json(
    { ok: false, error: { code, message }, traceId: tid },
    { status, headers: { "x-trace-id": tid } }
  );
}

async function validateBody<T extends z.ZodTypeAny>(
  req: NextRequest,
  schema: T,
  tid: string
): Promise<{ ok: true; data: z.infer<T> } | { ok: false; res: Response }> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return { ok: false, res: jsonError("BAD_JSON", "Invalid JSON body.", tid, 400) };
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, res: jsonError("VALIDATION_ERROR", parsed.error.message, tid, 400) };
  }

  return { ok: true, data: parsed.data as z.infer<T> };
}

function requireTenant(req: NextRequest, tid: string):
  | { ok: true; tenantId: string; tenantSlug: string; userId?: string }
  | { ok: false; res: Response } {
  const tenantId = req.headers.get("x-tenant-id") || "";
  const tenantSlug = req.headers.get("x-tenant-slug") || "";
  const userId = req.headers.get("x-user-id") || undefined;

  if (!tenantId) return { ok: false, res: jsonError("TENANT_CONTEXT_REQUIRED", "Missing x-tenant-id.", tid, 401) };
  if (!tenantSlug) return { ok: false, res: jsonError("TENANT_CONTEXT_REQUIRED", "Missing x-tenant-slug.", tid, 401) };

  return { ok: true, tenantId, tenantSlug, userId };
}

function stripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
  return new Stripe(key, { apiVersion: "2026-01-28.clover" });
}

function getOrigin(req: NextRequest): string {
  return (
    req.headers.get("origin") ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "http://localhost:3000"
  );
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<Response> {
  const tid = traceId();

  const tenant = requireTenant(req, tid);
  if (!tenant.ok) return tenant.res;

  const body = await validateBody(req, BodySchema, tid);
  if (!body.ok) return body.res;

  const { id: deviceId } = await ctx.params;

  const device = await prisma.mobileDevice.findFirst({
    where: { id: deviceId, tenantId: tenant.tenantId },
    select: { id: true, name: true },
  });
  if (!device) return jsonError("NOT_FOUND", "Device not found.", tid, 404);

  const price30 = process.env.STRIPE_PRICE_DEVICE_FAIR_30D;
  const price365 = process.env.STRIPE_PRICE_DEVICE_YEAR_365D;

  const priceId = body.data.type === "FAIR_30D" ? price30 : price365;

  if (!priceId) {
    return jsonError("CONFIG_ERROR", `Missing Stripe price env for ${body.data.type}.`, tid, 500);
  }

  const origin = getOrigin(req);
  const successUrl = `${origin}/admin/devices?checkout=success&deviceId=${encodeURIComponent(deviceId)}`;
  const cancelUrl = `${origin}/admin/devices?checkout=cancel&deviceId=${encodeURIComponent(deviceId)}`;

  let session: Stripe.Checkout.Session;
  try {
    session = await stripeClient().checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: deviceId,
      metadata: {
        tenantId: tenant.tenantId,
        deviceId,
        licenseType: body.data.type,
        userId: tenant.userId ?? "",
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Stripe error.";
    return jsonError("STRIPE_ERROR", msg, tid, 502);
  }

  if (!session.url) return jsonError("STRIPE_ERROR", "Missing checkout URL.", tid, 502);

  return jsonOk({ checkoutUrl: session.url }, tid);
}
