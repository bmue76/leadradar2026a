/**
 * Exports Smoke (TP 4.0) — matches actual API routes:
 * - POST   /api/admin/v1/exports/csv        -> creates job
 * - GET    /api/admin/v1/exports/:id        -> polls status
 * - GET    /api/admin/v1/exports/:id/download -> downloads CSV when DONE
 *
 * Optional env:
 *   EXPORTS_SMOKE_BASE_URL="http://localhost:3000"
 *   SMOKE_ATLEX_EMAIL / SMOKE_ATLEX_PASSWORD
 *   SMOKE_DEMO_EMAIL / SMOKE_DEMO_PASSWORD
 */

import fs from "node:fs";
import crypto from "node:crypto";

const baseUrl = process.env.EXPORTS_SMOKE_BASE_URL || process.env.AUTH_SMOKE_BASE_URL || "http://localhost:3000";

const checks = [
  {
    label: "Atlex",
    email: process.env.SMOKE_ATLEX_EMAIL || "admin@atlex.ch",
    password: process.env.SMOKE_ATLEX_PASSWORD || "Admin1234!"
  },
  {
    label: "Demo",
    email: process.env.SMOKE_DEMO_EMAIL || "admin@leadradar.local",
    password: process.env.SMOKE_DEMO_PASSWORD || "ChangeMe123!"
  }
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRecord(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function deepFindString(root, keys) {
  const want = new Set((keys || []).map((k) => String(k)));
  const seen = new Set();

  function walk(node) {
    if (!node || typeof node !== "object") return "";
    if (seen.has(node)) return "";
    seen.add(node);

    if (Array.isArray(node)) {
      for (const it of node) {
        const r = walk(it);
        if (r) return r;
      }
      return "";
    }

    for (const [k, v] of Object.entries(node)) {
      if (want.has(k) && typeof v === "string" && v.trim()) return v.trim();
    }
    for (const v of Object.values(node)) {
      const r = walk(v);
      if (r) return r;
    }
    return "";
  }

  return walk(root);
}

function deepFindStatus(root) {
  const s = deepFindString(root, ["status", "state", "phase"]);
  return s ? s.toUpperCase() : "";
}

function extractCookiePair(setCookieHeader, cookieName) {
  if (!setCookieHeader) return "";
  const idx = setCookieHeader.indexOf(`${cookieName}=`);
  if (idx === -1) return "";
  const sub = setCookieHeader.slice(idx);
  const end = sub.indexOf(";");
  const pair = end === -1 ? sub : sub.slice(0, end);
  return pair.trim();
}

async function http({ method, path, cookie, headers, body, timeoutMs }) {
  const url = `${String(baseUrl).replace(/\/$/, "")}${path}`;
  const h = { accept: "application/json", ...(headers || {}) };
  if (cookie) h.cookie = cookie;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs || 20_000);

  let res;
  let text = "";
  let json = null;

  try {
    res = await fetch(url, {
      method,
      headers: h,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctrl.signal
    });
    text = await res.text();
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  } finally {
    clearTimeout(t);
  }

  return { url, res, text, json };
}

async function adminLogin({ label, email, password }) {
  const r = await http({
    method: "POST",
    path: "/api/auth/login",
    headers: { "content-type": "application/json", "x-debug-auth": "1" },
    body: { email, password },
    timeoutMs: 15_000
  });

  if (!r.res.ok || !r.json?.ok) {
    throw new Error(
      `[${label} login] HTTP ${r.res.status} ${r.res.statusText} :: ${r.json ? JSON.stringify(r.json) : r.text}`
    );
  }

  const setCookie = r.res.headers.get("set-cookie") || "";
  const lrSession = extractCookiePair(setCookie, "lr_session");
  if (!lrSession) throw new Error(`[${label} login] missing lr_session cookie.`);
  return lrSession;
}

async function getActiveEventId(cookie) {
  const r = await http({
    method: "GET",
    path: "/api/admin/v1/events/active",
    cookie,
    timeoutMs: 15_000
  });

  if (!r.res.ok || !r.json?.ok) return null;

  const id =
    deepFindString(r.json?.data, ["id", "eventId"]) ||
    deepFindString(r.json?.data?.item, ["id"]) ||
    deepFindString(r.json?.data?.event, ["id"]);

  return id || null;
}

function randHex(nBytes = 6) {
  return crypto.randomBytes(nBytes).toString("hex");
}

async function createExportJob({ label, cookie, eventId }) {
  const bodies = [
    undefined,
    {},
    { type: "CSV" },
    ...(eventId ? [{ eventId }, { type: "CSV", eventId }] : [])
  ];

  const tried = [];

  for (const b of bodies) {
    const r = await http({
      method: "POST",
      path: "/api/admin/v1/exports/csv",
      cookie,
      headers: b !== undefined ? { "content-type": "application/json" } : undefined,
      body: b,
      timeoutMs: 20_000
    });

    if (!r.res.ok || !r.json?.ok) {
      tried.push(`- POST /api/admin/v1/exports/csv -> HTTP ${r.res.status} ${r.res.statusText}`);
      continue;
    }

    const jobId =
      deepFindString(r.json?.data, ["id", "jobId", "exportId"]) ||
      deepFindString(r.json?.data?.job, ["id"]) ||
      deepFindString(r.json?.data?.item, ["id"]);

    if (!jobId) {
      tried.push(`- POST /api/admin/v1/exports/csv -> ok but no id in response`);
      continue;
    }

    console.log(`✅ [${label}] export job created id=${jobId}`);
    return jobId;
  }

  throw new Error(`[${label}] create export job failed. Tried:\n${tried.join("\n")}`);
}

async function pollExportJob({ label, cookie, jobId }) {
  const start = Date.now();
  const timeoutMs = 90_000;

  while (Date.now() - start < timeoutMs) {
    const r = await http({
      method: "GET",
      path: `/api/admin/v1/exports/${jobId}`,
      cookie,
      timeoutMs: 15_000
    });

    if (!r.res.ok || !r.json?.ok) {
      throw new Error(
        `[${label}] poll export job failed: HTTP ${r.res.status} ${r.res.statusText} :: ${r.json ? JSON.stringify(r.json) : r.text}`
      );
    }

    const job = isRecord(r.json?.data?.job) ? r.json.data.job : r.json?.data;
    const status = deepFindStatus(job) || deepFindStatus(r.json?.data) || deepFindStatus(r.json);

    if (status) console.log(`ℹ️  [${label}] export status=${status}`);

    if (status === "DONE") return;

    if (status === "FAILED" || status === "ERROR") {
      throw new Error(`[${label}] export job failed (status=${status}).`);
    }

    await sleep(800);
  }

  throw new Error(`[${label}] export job poll timeout.`);
}

async function downloadExport({ label, cookie, jobId }) {
  const url = `${String(baseUrl).replace(/\/$/, "")}/api/admin/v1/exports/${jobId}/download`;

  const res = await fetch(url, { headers: cookie ? { cookie } : undefined });
  const ct = (res.headers.get("content-type") || "").toLowerCase();

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[${label}] export download failed: HTTP ${res.status} ${res.statusText} :: ${text.slice(0, 300)}`);
  }

  if (ct.includes("application/json")) {
    const text = await res.text();
    throw new Error(`[${label}] export download returned JSON (expected CSV): ${text.slice(0, 300)}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  const outFile = `downloaded-${label.toLowerCase()}-export-${jobId.slice(0, 8)}-${randHex(4)}.csv`;
  fs.writeFileSync(outFile, buf);

  const txt = buf.toString("utf8").trim();
  if (!txt) throw new Error(`[${label}] downloaded export is empty.`);
  if (txt.startsWith("<!DOCTYPE html") || txt.includes("<html")) throw new Error(`[${label}] downloaded export looks like HTML (auth/route issue).`);
  if (!txt.includes("\n")) throw new Error(`[${label}] downloaded export has no newline (unexpected).`);

  console.log(`✅ [${label}] export downloaded ok (${outFile})`);
  return outFile;
}

async function mainForTenant(c) {
  const { label } = c;
  console.log(`\n=== Exports smoke: ${label} ===`);

  const cookie = await adminLogin(c);

  const activeEventId = await getActiveEventId(cookie);
  if (activeEventId) console.log(`ℹ️  [${label}] using activeEventId=${activeEventId}`);

  const jobId = await createExportJob({ label, cookie, eventId: activeEventId });
  await pollExportJob({ label, cookie, jobId });
  await downloadExport({ label, cookie, jobId });

  console.log(`✅ [${label}] exports smoke PASSED`);
}

async function main() {
  console.log(`Exports smoke against: ${baseUrl}`);

  const failed = [];
  for (const c of checks) {
    try {
      await mainForTenant(c);
    } catch (e) {
      console.error(`❌ [${c.label}] exports smoke FAILED:`, e?.message || e);
      failed.push(c.label);
    }
  }

  if (failed.length) {
    console.error(`\nExports smoke FAILED for: ${failed.join(", ")}`);
    process.exit(1);
  }

  console.log("\nExports smoke ALL tenants PASSED.");
}

main().catch((e) => {
  console.error("❌ exports:smoke crashed:", e?.message || e);
  process.exit(1);
});
