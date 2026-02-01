import Stripe from "stripe";

import { jsonError, jsonOk } from "@/lib/api";
import { prisma } from "@/lib/dbAdapter";
import { getStripe, getStripeWebhookSecret } from "@/lib/stripe";

export const runtime = "nodejs";

function addDaysUtc(d: Date, days: number): Date {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

type SessionObj = Stripe.Checkout.Session & {
  metadata?: Record<string, string | undefined> | null;
  amount_total?: number | null;
  currency?: string | null;
  payment_intent?: string | Stripe.PaymentIntent | null;
};

function errToString(e: unknown): string {
  if (e instanceof Error) return e.message;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

export async function POST(req: Request) {
  const stripe = getStripe();

  // only used in the outer catch
  let lastStripeEventId: string | undefined;

  try {
    const sig = req.headers.get("stripe-signature");
    if (!sig) return jsonError(req, 400, "STRIPE_SIGNATURE_MISSING", "Missing Stripe signature.");

    const rawBody = await req.text();

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, getStripeWebhookSecret());
    } catch {
      return jsonError(req, 400, "STRIPE_SIGNATURE_INVALID", "Invalid Stripe signature.");
    }

    const stripeEventId = event.id; // stable, non-null
    lastStripeEventId = stripeEventId;

    const type = event.type;

    // Concurrency-safe idempotency claim (create row first).
    const stripeEventRow = await prisma.stripeEvent
      .create({
        data: {
          stripeEventId,
          type,
          status: "FAILED", // will be overwritten to PROCESSED/IGNORED on success
          payloadJson: { stripeEventId, type },
        },
        select: { id: true, status: true },
      })
      .catch(async () => {
        const existing = await prisma.stripeEvent.findUnique({
          where: { stripeEventId },
          select: { id: true, status: true },
        });
        if (!existing) throw new Error("StripeEvent claim failed unexpectedly.");
        return existing;
      });

    if (stripeEventRow.status === "PROCESSED" || stripeEventRow.status === "IGNORED") {
      return jsonOk(req, { received: true });
    }

    // Only process the event we care about (MVP)
    if (type !== "checkout.session.completed") {
      await prisma.stripeEvent.update({
        where: { stripeEventId },
        data: {
          status: "IGNORED",
          processedAt: new Date(),
          payloadJson: { stripeEventId, type },
          errorMessage: null,
        },
      });
      return jsonOk(req, { received: true });
    }

    const session = event.data.object as SessionObj;

    const meta = session.metadata ?? {};
    const tenantId = (meta.tenantId ?? "").trim();
    const skuId = (meta.skuId ?? "").trim();

    if (!tenantId || !skuId) {
      await prisma.stripeEvent.update({
        where: { stripeEventId },
        data: {
          status: "IGNORED",
          processedAt: new Date(),
          payloadJson: { stripeEventId, type, sessionId: session.id, reason: "missing_metadata" },
          errorMessage: null,
        },
      });
      return jsonOk(req, { received: true });
    }

    const paymentIntentId =
      typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;

    const amountCents = typeof session.amount_total === "number" ? session.amount_total : null;
    const currency = session.currency ? String(session.currency).toUpperCase() : null;

    await prisma.$transaction(async (tx) => {
      const sku = await tx.billingSku.findUnique({
        where: { id: skuId },
        select: {
          id: true,
          active: true,
          currency: true,
          amountCents: true,
          grantLicense30d: true,
          grantLicense365d: true,
          grantDeviceSlots: true,
          creditExpiresInDays: true,
        },
      });

      if (!sku || !sku.active) {
        await tx.stripeEvent.update({
          where: { stripeEventId },
          data: {
            status: "IGNORED",
            processedAt: new Date(),
            tenantId,
            payloadJson: { stripeEventId, type, sessionId: session.id, skuId, reason: "sku_not_found_or_inactive" },
            errorMessage: null,
          },
        });
        return;
      }

      const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
      if (!tenant) {
        await tx.stripeEvent.update({
          where: { stripeEventId },
          data: {
            status: "IGNORED",
            processedAt: new Date(),
            tenantId: null,
            payloadJson: { stripeEventId, type, sessionId: session.id, skuId, reason: "tenant_not_found" },
            errorMessage: null,
          },
        });
        return;
      }

      /**
       * IMPORTANT (Postgres):
       * Do NOT do `create().catch(...)` inside a transaction to "ignore unique collisions".
       * A failed statement marks the whole transaction as aborted.
       *
       * Use createMany(skipDuplicates) => ON CONFLICT DO NOTHING (no error, tx stays valid).
       */
      await tx.billingOrder.createMany({
        data: [
          {
            tenantId,
            skuId: sku.id,
            stripeCheckoutSessionId: session.id,
            stripePaymentIntentId: paymentIntentId,
            status: "PENDING",
            currency: currency ?? sku.currency,
            amountCents: amountCents ?? sku.amountCents ?? null,
          },
        ],
        skipDuplicates: true,
      });

      // Idempotency guard: only first processing flips status to PAID.
      const now = new Date();
      const updated = await tx.billingOrder.updateMany({
        where: { stripeCheckoutSessionId: session.id, status: { not: "PAID" } },
        data: {
          status: "PAID",
          paidAt: now,
          stripePaymentIntentId: paymentIntentId,
          currency: currency ?? sku.currency,
          amountCents: amountCents ?? sku.amountCents ?? null,
        },
      });

      // If already paid, just mark event processed (idempotent)
      if (updated.count === 0) {
        await tx.stripeEvent.update({
          where: { stripeEventId },
          data: {
            status: "PROCESSED",
            processedAt: now,
            tenantId,
            payloadJson: { stripeEventId, type, sessionId: session.id, skuId, alreadyPaid: true },
            errorMessage: null,
          },
        });
        return;
      }

      const expiresAt = addDaysUtc(now, sku.creditExpiresInDays);

      async function grant(creditType: "LICENSE_30D" | "LICENSE_365D" | "DEVICE_SLOT", qty: number) {
        if (qty <= 0) return;

        await tx.tenantCreditBalance.upsert({
          where: {
            tenantId_type_expiresAt: {
              tenantId,
              type: creditType,
              expiresAt,
            },
          },
          update: { quantity: { increment: qty } },
          create: { tenantId, type: creditType, quantity: qty, expiresAt },
        });

        await tx.tenantCreditLedger.create({
          data: { tenantId, type: creditType, delta: qty, reason: "STRIPE_PURCHASE", refId: session.id },
        });
      }

      await grant("LICENSE_30D", sku.grantLicense30d);
      await grant("LICENSE_365D", sku.grantLicense365d);
      await grant("DEVICE_SLOT", sku.grantDeviceSlots);

      await tx.stripeEvent.update({
        where: { stripeEventId },
        data: {
          status: "PROCESSED",
          processedAt: now,
          tenantId,
          payloadJson: {
            stripeEventId,
            type,
            sessionId: session.id,
            paymentIntentId,
            skuId,
            amountCents: amountCents ?? sku.amountCents ?? null,
            currency: currency ?? sku.currency,
          },
          errorMessage: null,
        },
      });
    });

    return jsonOk(req, { received: true });
  } catch (e) {
    if (lastStripeEventId) {
      await prisma.stripeEvent
        .update({
          where: { stripeEventId: lastStripeEventId },
          data: { status: "FAILED", processedAt: new Date(), errorMessage: errToString(e) },
        })
        .catch(() => {
          // ignore
        });
    }

    // Important: return 500 so Stripe retries
    return jsonError(req, 500, "WEBHOOK_FAILED", "Stripe webhook processing failed.", { message: errToString(e) });
  }
}
