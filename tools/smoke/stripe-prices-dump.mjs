import dotenv from "dotenv";
import Stripe from "stripe";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const key = (process.env.STRIPE_SECRET_KEY ?? "").trim();
if (!key) {
  console.error("Missing STRIPE_SECRET_KEY");
  process.exit(1);
}

const stripe = new Stripe(key, { apiVersion: "2026-01-28.clover" });

const priceIds = [
  "price_1SvkZZHZ6Wqiu55s3MRfh2iS",
  "price_1SvSCsHZ6Wqiu55siups2VXL",
  "price_1SvSCuHZ6Wqiu55sPQBDX4nD",
  "price_1SvSCvHZ6Wqiu55s23wpeUVk",
  "price_1SvSCxHZ6Wqiu55sfeL2JUob",
  "price_1SvSCyHZ6Wqiu55st1RSmtFM",
  "price_1SvSCzHZ6Wqiu55sBV9QzYTk",
  "price_1SvkSbHZ6Wqiu55ssPSwImYg",
];

for (const id of priceIds) {
  const p = await stripe.prices.retrieve(id);
  console.log(id, "currency=", p.currency?.toUpperCase(), "unit_amount=", p.unit_amount);
}
