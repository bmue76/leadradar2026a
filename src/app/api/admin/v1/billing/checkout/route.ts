import { z } from "zod";

import { jsonError, jsonOk } from "@/lib/api";
import { requireAdminAuth } from "@/lib/auth";
import { isHttpError, validateBody } from "@/lib/http";
import { prisma } from "@/lib/dbAdapter";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

const BodySchema = z.object({
  skuId: z.string().min(1),
});

type AdminCtx = { tenantId: string; userId?: string };

function getOrigin(req: Request): string {
  const url = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");

  if (proto && host) return `${proto}://${host}`;
  if (host) return `${url.protocol}//${host}`;
  return url.origin;
}

export async function POST(req: Request) {
  try {
    const ctx = (await requireAdminAuth(req)) as AdminCtx;
    const body = await validateBody(req, BodySchema);

    const sku = await prisma.billingSku.findUnique({
      where: { id: body.skuId },
      select: { id: true, active: true, stripePriceId: true },
    });

    if (!sku || !sku.active) {
      return jsonError(req, 404, "NOT_FOUND", "Paket nicht gefunden.");
    }

    const stripe = getStripe();
    const origin = getOrigin(req);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: sku.stripePriceId, quantity: 1 }],
      success_url: `${origin}/admin/billing?checkout=success`,
      cancel_url: `${origin}/admin/billing?checkout=cancel`,
      metadata: {
        tenantId: ctx.tenantId,
        skuId: sku.id,
        userId: ctx.userId ?? "",
      },
    });

    if (!session.url) {
      return jsonError(req, 500, "STRIPE_SESSION", "Checkout konnte nicht erstellt werden.");
    }

    // Audit: order is PENDING here. Credits are granted ONLY via verified webhook.
    await prisma.billingOrder
      .create({
        data: {
          tenantId: ctx.tenantId,
          skuId: sku.id,
          stripeCheckoutSessionId: session.id,
          status: "PENDING",
        },
      })
      .catch(() => {
        // ignore unique collisions
      });

    return jsonOk(req, { checkoutUrl: session.url });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
