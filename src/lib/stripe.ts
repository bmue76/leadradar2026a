import Stripe from "stripe";

export const STRIPE_API_VERSION = "2026-01-28.clover" as const;

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || !key.trim()) throw new Error("STRIPE_SECRET_KEY missing (set it in .env.local).");

  return new Stripe(key, { apiVersion: STRIPE_API_VERSION });
}

export function getStripeWebhookSecret(): string {
  const s = process.env.STRIPE_WEBHOOK_SECRET;
  if (!s || !s.trim()) throw new Error("STRIPE_WEBHOOK_SECRET missing (set it in .env.local).");
  return s;
}
