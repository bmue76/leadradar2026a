import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
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

let cachedStripe: Stripe | null = null;
function getStripe(): Stripe {
  if (cachedStripe) return cachedStripe;
  const key = env("STRIPE_SECRET_KEY");
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY.");
  cachedStripe = new Stripe(key, { apiVersion: "2026-01-28.clover" });
  return cachedStripe;
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

function durationDays(type: string): number | null {
  if (type === "FAIR_30D") return 30;
  if (type === "YEAR_365D") return 365;
  return null;
}

function extractPaymentIntentId(pi: Stripe.Checkout.Session["payment_intent"]): string | null {
  if (!pi) return null;
  if (typeof pi === "string") return pi;
  if (typeof pi === "object" && "id" in pi && typeof pi.id === "string") return pi.id;
  return null;
}

export async function POST(req: NextRequest): Promise<Response> {
  const tid = traceId();

  const webhookSecret = env("STRIPE_WEBHOOK_SECRET");
  if (!webhookSecret) return jsonError("CONFIG_ERROR", "Missing STRIPE_WEBHOOK_SECRET.", tid, 500);

  let stripe: Stripe;
  try {
    stripe = getStripe();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Stripe init failed.";
    return jsonError("CONFIG_ERROR", msg, tid, 500);
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) return jsonError("BAD_REQUEST", "Missing stripe-signature header.", tid, 400);

  const raw = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, webhookSecret) as Stripe.Event;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Webhook signature verification failed.";
    return jsonError("STRIPE_SIGNATURE_ERROR", msg, tid, 400);
  }

  // StripeEvent idempotency
  const existing = await prisma.stripeEvent.findUnique({
    where: { stripeEventId: event.id },
    select: { id: true },
  });
  if (existing) return jsonOk({ received: true, duplicate: true }, tid);

  try {
    if (event.type !== "checkout.session.completed") {
      await prisma.stripeEvent.create({
        data: {
          stripeEventId: event.id,
          type: event.type,
          status: "IGNORED",
          processedAt: new Date(),
          payloadJson: { type: event.type } as unknown as object,
        },
      });
      return jsonOk({ received: true, ignored: true }, tid);
    }

    const session = event.data.object as Stripe.Checkout.Session;

    const md = session.metadata ?? {};
    const tenantId = (md["tenantId"] || "").toString();
    const deviceId = (md["deviceId"] || "").toString();
    const licenseType = (md["licenseType"] || "").toString();
    const userId = (md["userId"] || "").toString() || null;

    const days = durationDays(licenseType);
    if (!tenantId || !deviceId || !days) {
      await prisma.stripeEvent.create({
        data: {
          stripeEventId: event.id,
          type: event.type,
          status: "FAILED",
          processedAt: new Date(),
          errorMessage: "Missing metadata tenantId/deviceId/licenseType.",
          payloadJson: { tenantId, deviceId, licenseType } as unknown as object,
        },
      });
      return jsonOk({ received: true, failed: true }, tid);
    }

    const device = await prisma.mobileDevice.findFirst({
      where: { id: deviceId, tenantId },
      select: { id: true, lastSeenAt: true },
    });
    if (!device) {
      await prisma.stripeEvent.create({
        data: {
          stripeEventId: event.id,
          type: event.type,
          status: "FAILED",
          processedAt: new Date(),
          tenantId,
          errorMessage: "Device not found for tenant.",
          payloadJson: { deviceId } as unknown as object,
        },
      });
      return jsonOk({ received: true, failed: true }, tid);
    }

    const now = new Date();

    const amountCents = typeof session.amount_total === "number" ? session.amount_total : null;
    const currency = typeof session.currency === "string" ? session.currency : null;
    const paymentIntentId = extractPaymentIntentId(session.payment_intent);

    // If device never activated/used (lastSeenAt null), do NOT start countdown yet.
    const shouldDefer = device.lastSeenAt === null;

    if (shouldDefer) {
      // Pending purchase: startsAt==endsAt==now, note marks as pending.
      await prisma.deviceLicense.create({
        data: {
          tenantId,
          deviceId,
          type: licenseType as "FAIR_30D" | "YEAR_365D",
          status: "ACTIVE",
          startsAt: now,
          endsAt: now,
          stripeCheckoutSessionId: session.id,
          stripePaymentIntentId: paymentIntentId ?? undefined,
          amountCents: amountCents ?? undefined,
          currency: currency ?? undefined,
          createdByUserId: userId,
          note: "stripe_pending",
        },
        select: { id: true },
      });
    } else {
      // Normal behavior: extend from max(now, currentEndsAt)
      const current = await prisma.deviceLicense.findFirst({
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

      const base = current?.endsAt && current.endsAt.getTime() > now.getTime() ? current.endsAt : now;
      const startsAt = base;
      const endsAt = addDays(base, days);

      await prisma.deviceLicense.create({
        data: {
          tenantId,
          deviceId,
          type: licenseType as "FAIR_30D" | "YEAR_365D",
          status: "ACTIVE",
          startsAt,
          endsAt,
          stripeCheckoutSessionId: session.id,
          stripePaymentIntentId: paymentIntentId ?? undefined,
          amountCents: amountCents ?? undefined,
          currency: currency ?? undefined,
          createdByUserId: userId,
          note: "stripe",
        },
        select: { id: true },
      });
    }

    await prisma.stripeEvent.create({
      data: {
        stripeEventId: event.id,
        type: event.type,
        status: "PROCESSED",
        processedAt: new Date(),
        tenantId,
        payloadJson: { sessionId: session.id, deviceId, licenseType, deferred: shouldDefer } as unknown as object,
      },
    });

    return jsonOk({ received: true, processed: true, deferred: shouldDefer }, tid);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Webhook handler error.";

    try {
      await prisma.stripeEvent.create({
        data: {
          stripeEventId: event.id,
          type: event.type,
          status: "FAILED",
          processedAt: new Date(),
          errorMessage: msg,
          payloadJson: { type: event.type } as unknown as object,
        },
      });
    } catch {
      // ignore
    }

    return jsonError("WEBHOOK_ERROR", msg, tid, 500);
  }
}
