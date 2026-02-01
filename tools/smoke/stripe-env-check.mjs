import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const keys = Object.keys(process.env)
  .filter((k) => k.toUpperCase().includes("STRIPE"))
  .sort();

console.log("Found STRIPE-related env keys:", keys.length ? keys.join(", ") : "(none)");

for (const k of keys) {
  const v = process.env[k] ?? "";
  const masked = v ? `${v.slice(0, 10)}…` : "(empty)";
  console.log(`${k}=${masked}`);
}
