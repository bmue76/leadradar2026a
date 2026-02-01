import dotenv from "dotenv";
import Stripe from "stripe";

dotenv.config({ path: ".env.local" });

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("STRIPE_SECRET_KEY missing in .env.local");
  process.exit(1);
}

const stripe = new Stripe(key, { apiVersion: "2026-01-28.clover" });

const packages = [
  { k: "LR_30D_3",  name: "3× 30-Tage Lizenz-Credit",  amountCents: 11700, currency: "chf" },
  { k: "LR_30D_5",  name: "5× 30-Tage Lizenz-Credit",  amountCents: 19500, currency: "chf" },
  { k: "LR_30D_10", name: "10× 30-Tage Lizenz-Credit", amountCents: 39000, currency: "chf" },
  { k: "LR_365D_1", name: "1× 365-Tage Lizenz-Credit", amountCents: 29900, currency: "chf" },
  { k: "LR_365D_3", name: "3× 365-Tage Lizenz-Credit", amountCents: 89700, currency: "chf" },
  { k: "LR_365D_5", name: "5× 365-Tage Lizenz-Credit", amountCents: 149500, currency: "chf" },
];

async function findProductByKey(pkgKey) {
  // Prefer search (fast)
  if (typeof stripe.products.search === "function") {
    const res = await stripe.products.search({
      query: `metadata['lr_pkg_key']:'${pkgKey}'`,
      limit: 1,
    });
    if (res.data.length) return res.data[0];
  }

  // Fallback: list recent products (ok for dev)
  const list = await stripe.products.list({ limit: 100 });
  return list.data.find((p) => p.metadata?.lr_pkg_key === pkgKey) ?? null;
}

async function ensurePrice(pkg, productId) {
  // Try search existing price for this pkg key + amount
  if (typeof stripe.prices.search === "function") {
    const res = await stripe.prices.search({
      query: `active:'true' AND metadata['lr_pkg_key']:'${pkg.k}'`,
      limit: 10,
    });
    const hit = res.data.find((p) => p.unit_amount === pkg.amountCents && p.currency === pkg.currency);
    if (hit) return hit;
  }

  // Fallback: list prices for product
  const list = await stripe.prices.list({ product: productId, limit: 50 });
  const hit = list.data.find((p) => p.active && p.unit_amount === pkg.amountCents && p.currency === pkg.currency);
  if (hit) return hit;

  // Create new one-time price
  return await stripe.prices.create({
    product: productId,
    currency: pkg.currency,
    unit_amount: pkg.amountCents,
    metadata: { lr_pkg_key: pkg.k },
  });
}

async function main() {
  console.log("Creating/ensuring Stripe Products + Prices (TEST MODE) …");

  const out = [];

  for (const pkg of packages) {
    let product = await findProductByKey(pkg.k);
    if (!product) {
      product = await stripe.products.create({
        name: pkg.name,
        metadata: { lr_pkg_key: pkg.k },
      });
      console.log(`+ product created: ${pkg.k} -> ${product.id}`);
    } else {
      console.log(`= product exists:  ${pkg.k} -> ${product.id}`);
    }

    const price = await ensurePrice(pkg, product.id);
    console.log(`  price: ${pkg.k} -> ${price.id} (${price.currency.toUpperCase()} ${price.unit_amount})`);
    out.push({ key: pkg.k, priceId: price.id, amountCents: pkg.amountCents });
  }

  console.log("\nDONE ✅ Price IDs (copy into seed):");
  for (const r of out) console.log(`- ${r.key} = ${r.priceId}`);
}

main().catch((e) => {
  console.error("FAILED ❌", e?.type ?? "", e?.code ?? "", e?.message ?? e);
  process.exit(1);
});
