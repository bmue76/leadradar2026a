/**
 * Auth Smoke Test for DEV
 * - Verifies that known dev logins work
 * - Fails fast with clear output (exit code 1)
 *
 * Usage:
 *   node scripts/auth-smoke.mjs
 *
 * Optional env:
 *   AUTH_SMOKE_BASE_URL="http://localhost:3000"
 */
const baseUrl = process.env.AUTH_SMOKE_BASE_URL || "http://localhost:3000";

const checks = [
  { label: "Atlex", email: "admin@atlex.ch", password: "Admin1234!" },
  { label: "Demo", email: "admin@leadradar.local", password: "ChangeMe123!" },
];

async function login({ label, email, password }) {
  const url = `${baseUrl.replace(/\/$/, "")}/api/auth/login`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-debug-auth": "1",
    },
    body: JSON.stringify({ email, password }),
  });

  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // keep json null; we'll print text
  }

  if (!res.ok) {
    console.error(`❌ [${label}] HTTP ${res.status} ${res.statusText}`);
    console.error(json ?? text);
    process.exitCode = 1;
    return;
  }

  if (!json?.ok) {
    console.error(`❌ [${label}] Response ok=false`);
    console.error(json ?? text);
    process.exitCode = 1;
    return;
  }

  const setCookie = res.headers.get("set-cookie") || "";
  const hasSession = setCookie.includes("lr_session=");

  console.log(`✅ [${label}] OK (${email})${hasSession ? " + lr_session" : ""}`);
}

async function main() {
  console.log(`Auth smoke against: ${baseUrl}`);
  for (const c of checks) {
    // eslint-disable-next-line no-await-in-loop
    await login(c);
  }

  if (process.exitCode === 1) {
    console.error("Auth smoke FAILED.");
    process.exit(1);
  } else {
    console.log("Auth smoke PASSED.");
  }
}

main().catch((e) => {
  console.error("Auth smoke crashed:", e);
  process.exit(1);
});
