/**
 * Mobile Smoke (TP 4.0)
 * Flow:
 * - Admin login (cookie)
 * - Issue provision token (admin) -> claim -> x-api-key + deviceId
 * - Ensure ACTIVE event (create+activate smoke event)
 * - Patch device ACTIVE + bind activeEventId
 * - Mobile forms list -> if empty: admin-assign an ACTIVE form to device -> retry mobile forms
 * - Create lead via POST /api/mobile/v1/leads (MUST include capturedAt + values)
 *
 * Usage:
 *   node tools/smoke/mobile-smoke.mjs
 *
 * Optional env:
 *   MOBILE_SMOKE_BASE_URL="http://localhost:3000"
 *   SMOKE_ATLEX_EMAIL / SMOKE_ATLEX_PASSWORD
 *   SMOKE_DEMO_EMAIL / SMOKE_DEMO_PASSWORD
 *
 * Notes:
 * - No secrets are written to disk.
 * - Uses jsonOk/jsonError contract where available.
 */

import crypto from "node:crypto";
import {
  httpJson,
  tryJsonOk,
  pickItemsArray,
  assertOkAllowMissingTraceId,
  extractCookiePair,
  isRecord,
  buildSmokeValuesFromForm,
  sleep,
} from "./_smoke-lib.mjs";

const baseUrl = process.env.MOBILE_SMOKE_BASE_URL || process.env.AUTH_SMOKE_BASE_URL || "http://localhost:3000";

const checks = [
  {
    label: "Atlex",
    tenantSlug: "atlex",
    email: process.env.SMOKE_ATLEX_EMAIL || "admin@atlex.ch",
    password: process.env.SMOKE_ATLEX_PASSWORD || "Admin1234!",
  },
  {
    label: "Demo",
    tenantSlug: "demo",
    email: process.env.SMOKE_DEMO_EMAIL || "admin@leadradar.local",
    password: process.env.SMOKE_DEMO_PASSWORD || "ChangeMe123!",
  },
];

function randHex(nBytes = 8) {
  return crypto.randomBytes(nBytes).toString("hex");
}

function nowIso() {
  return new Date().toISOString();
}

function pickStringDeep(payload, keys) {
  // Lightweight deep search for a string value by known keys.
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

  return walk(payload);
}

async function adminLogin({ label, email, password }) {
  const r = await httpJson({
    baseUrl,
    method: "POST",
    path: "/api/auth/login",
    headers: { "content-type": "application/json", "x-debug-auth": "1" },
    body: { email, password },
    timeoutMs: 15_000,
  });

  // This endpoint may be legacy-ish: allow missing traceId as warning.
  assertOkAllowMissingTraceId({ label: `${label} login`, ...r });

  const setCookie = r.res.headers.get("set-cookie") || "";
  const lrSession = extractCookiePair(setCookie, "lr_session");
  if (!lrSession) {
    throw new Error(`[${label} login] missing lr_session cookie in set-cookie header.`);
  }
  return lrSession;
}

async function issueProvisionToken({ label, cookie, tenantSlug }) {
  const deviceName = `Smoke Device (${tenantSlug})`;

  const candidates = [
    // Most likely:
    { method: "POST", path: "/api/admin/v1/mobile/provision-tokens", cookie, headers: { "content-type": "application/json" }, body: { deviceName } },
    { method: "POST", path: "/api/admin/v1/mobile/provisionTokens", cookie, headers: { "content-type": "application/json" }, body: { deviceName } },

    // Variants we saw historically:
    { method: "POST", path: "/api/admin/v1/mobile/provision-tokens", cookie, headers: { "content-type": "application/json" }, body: { requestedDeviceName: deviceName } },
    { method: "POST", path: "/api/admin/v1/mobile/provisionTokens", cookie, headers: { "content-type": "application/json" }, body: { requestedDeviceName: deviceName } },

    // Some implementations expect requestedFormIds:
    { method: "POST", path: "/api/admin/v1/mobile/provision-tokens", cookie, headers: { "content-type": "application/json" }, body: { deviceName, requestedFormIds: [] } },
    { method: "POST", path: "/api/admin/v1/mobile/provisionTokens", cookie, headers: { "content-type": "application/json" }, body: { deviceName, requestedFormIds: [] } },
  ];

  const r = await tryJsonOk({
    baseUrl,
    label: `${label} issue provision token`,
    candidates,
    timeoutMs: 15_000,
  });

  // Try to read cleartext token from header or body
  const headerToken = (r.res.headers.get("x-provision-token") || r.res.headers.get("x-provisioning-token") || "").trim();
  const bodyToken =
    pickStringDeep(r.json?.data, ["token", "plaintextToken", "provisionToken", "provisioningToken", "value"]) ||
    pickStringDeep(r.json, ["token", "plaintextToken", "provisionToken", "provisioningToken", "value"]);

  const token = headerToken || bodyToken;
  if (!token) {
    throw new Error(
      `[${label}] issued provision token but could not find cleartext token in response (header x-provision-token or body fields).`
    );
  }

  console.log(`✅ [${label}] issued provision token (plaintext received)`);
  return token;
}

async function claimProvisionToken({ label, tenantSlug, token }) {
  const deviceName = `Smoke Device (${tenantSlug})`;

  const r = await httpJson({
    baseUrl,
    method: "POST",
    path: "/api/mobile/v1/provision/claim",
    headers: { "content-type": "application/json", "x-tenant-slug": tenantSlug },
    body: { token, deviceName },
    timeoutMs: 20_000,
  });

  if (!r.res.ok || !r.json || r.json.ok !== true) {
    throw new Error(`[${label}] claim failed: HTTP ${r.res.status} ${r.res.statusText} :: ${r.json ? JSON.stringify(r.json) : r.text}`);
  }

  const apiKey =
    (r.res.headers.get("x-api-key") || "").trim() ||
    pickStringDeep(r.json?.data, ["token", "apiKeyToken"]) ||
    pickStringDeep(r.json, ["token", "apiKeyToken"]);

  const deviceId =
    pickStringDeep(r.json?.data, ["id", "deviceId"]) || pickStringDeep(r.json?.data?.device, ["id"]) || "";

  if (!apiKey) {
    throw new Error(`[${label}] claim ok but no x-api-key found in header/body.`);
  }
  if (!deviceId) {
    console.warn(`⚠️  [${label}] claim ok but deviceId not found in response body. Some follow-up steps may fail.`);
  }

  console.log(`✅ [${label}] claimed x-api-key (deviceUid=${tenantSlug ? `smoke_device_${tenantSlug}` : "smoke_device"}_${Date.now()}_${randHex(6)})`);
  if (deviceId) console.log(`ℹ️  [${label}] claim returned deviceId=${deviceId}`);

  return { apiKey, deviceId };
}

async function createAndActivateSmokeEvent({ label, cookie }) {
  const name = `Smoke Event ${label} ${nowIso()}`;

  const create = await httpJson({
    baseUrl,
    method: "POST",
    path: "/api/admin/v1/events",
    cookie,
    headers: { "content-type": "application/json" },
    body: { name, status: "DRAFT" },
    timeoutMs: 15_000,
  });

  if (!create.res.ok || !create.json?.ok) {
    throw new Error(`[${label}] create smoke event failed :: ${create.json ? JSON.stringify(create.json) : create.text}`);
  }

  const eventId =
    pickStringDeep(create.json?.data, ["id", "eventId"]) || pickStringDeep(create.json?.data?.event, ["id"]) || "";

  if (!eventId) throw new Error(`[${label}] create smoke event: missing eventId in response`);

  const activate = await httpJson({
    baseUrl,
    method: "PATCH",
    path: `/api/admin/v1/events/${eventId}/status`,
    cookie,
    headers: { "content-type": "application/json" },
    body: { status: "ACTIVE" },
    timeoutMs: 15_000,
  });

  if (!activate.res.ok || !activate.json?.ok) {
    throw new Error(`[${label}] activate smoke event failed :: ${activate.json ? JSON.stringify(activate.json) : activate.text}`);
  }

  console.log(`ℹ️  [${label}] created + activated smoke eventId=${eventId}`);
  return eventId;
}

async function patchDevice({ label, cookie, deviceId, activeEventId }) {
  if (!deviceId) return;

  const r = await httpJson({
    baseUrl,
    method: "PATCH",
    path: `/api/admin/v1/mobile/devices/${deviceId}`,
    cookie,
    headers: { "content-type": "application/json" },
    body: { status: "ACTIVE", activeEventId: activeEventId ?? null },
    timeoutMs: 15_000,
  });

  if (!r.res.ok || !r.json?.ok) {
    throw new Error(`[${label}] device patch failed :: ${r.json ? JSON.stringify(r.json) : r.text}`);
  }

  console.log(`ℹ️  [${label}] device patched: status=ACTIVE activeEventId=${activeEventId}`);
}

async function listMobileForms({ label, tenantSlug, apiKey }) {
  const r = await httpJson({
    baseUrl,
    method: "GET",
    path: "/api/mobile/v1/forms",
    headers: { "x-tenant-slug": tenantSlug, "x-api-key": apiKey },
    timeoutMs: 15_000,
  });

  if (!r.res.ok || !r.json?.ok) {
    throw new Error(`[${label}] forms list failed :: ${r.json ? JSON.stringify(r.json) : r.text}`);
  }

  const forms = pickItemsArray(r.json);
  return forms;
}

async function listAdminActiveForms({ label, cookie }) {
  const candidates = [
    { method: "GET", path: "/api/admin/v1/forms?limit=200&status=ACTIVE", cookie },
    { method: "GET", path: "/api/admin/v1/forms?status=ACTIVE&limit=200", cookie },
    { method: "GET", path: "/api/admin/v1/forms?limit=200", cookie },
  ];

  const r = await tryJsonOk({ baseUrl, label: `${label} list admin forms`, candidates, timeoutMs: 15_000 });
  const items = pickItemsArray(r.json);

  // Prefer ACTIVE if present
  const active = items.filter((x) => isRecord(x) && typeof x.status === "string" && x.status.toUpperCase() === "ACTIVE");
  return active.length ? active : items;
}

async function assignFormToDevice({ label, cookie, deviceId, formId }) {
  const r = await httpJson({
    baseUrl,
    method: "PUT",
    path: `/api/admin/v1/mobile/devices/${deviceId}/forms`,
    cookie,
    headers: { "content-type": "application/json" },
    body: { formIds: [formId] },
    timeoutMs: 15_000,
  });

  if (!r.res.ok || !r.json?.ok) {
    throw new Error(`[${label}] assign form failed :: ${r.json ? JSON.stringify(r.json) : r.text}`);
  }

  console.log(`✅ [${label}] auto-assigned formId=${formId} to deviceId=${deviceId}`);
}

async function verifyDeviceAssignments({ label, cookie, deviceId }) {
  const r = await httpJson({
    baseUrl,
    method: "GET",
    path: `/api/admin/v1/mobile/devices/${deviceId}`,
    cookie,
    timeoutMs: 15_000,
  });

  if (!r.res.ok || !r.json?.ok) {
    throw new Error(`[${label}] verify device failed :: ${r.json ? JSON.stringify(r.json) : r.text}`);
  }

  const assignedForms =
    (isRecord(r.json?.data) && Array.isArray(r.json.data.assignedForms) && r.json.data.assignedForms) ||
    (Array.isArray(r.json?.data?.assignedForms) ? r.json.data.assignedForms : []);

  const count = Array.isArray(assignedForms) ? assignedForms.length : 0;
  const sample = count ? assignedForms[0] : null;
  const sampleStr = sample && isRecord(sample) ? `${sample.id || "?"}(${sample.status || "?"})` : "n/a";
  console.log(`ℹ️  [${label}] admin verify assignedForms count=${count} sample=${sampleStr}`);
  return { count, assignedForms };
}

async function createLead({ label, tenantSlug, apiKey, formId }) {
  // REQUIRED by API:
  // - formId
  // - clientLeadId
  // - capturedAt (ISO string)
  // - values (record)
  const body = {
    formId,
    clientLeadId: `smoke_${tenantSlug}_${Date.now()}_${randHex(6)}`,
    capturedAt: nowIso(),
    values: buildSmokeValuesFromForm({ id: formId }),
    meta: { _smoke: "1", source: "mobile-smoke" },
  };

  const candidates = [
    {
      method: "POST",
      path: "/api/mobile/v1/leads",
      headers: { "content-type": "application/json", "x-tenant-slug": tenantSlug, "x-api-key": apiKey },
      body,
    },
  ];

  const r = await tryJsonOk({
    baseUrl,
    label: `${label} create lead`,
    candidates,
    timeoutMs: 20_000,
  });

  const leadId =
    pickStringDeep(r.json?.data, ["leadId", "id"]) || pickStringDeep(r.json, ["leadId", "id"]) || "";

  if (!leadId) {
    console.warn(`⚠️  [${label}] lead created but leadId not found in response body.`);
  } else {
    console.log(`✅ [${label}] lead created leadId=${leadId}`);
  }

  return leadId || "unknown";
}

async function mainForTenant(c) {
  const { label, tenantSlug } = c;
  console.log(`\n=== Mobile smoke: ${label} (tenantSlug=${tenantSlug}) ===`);

  const cookie = await adminLogin(c);

  // Provision -> claim -> apiKey + deviceId
  const provToken = await issueProvisionToken({ label, cookie, tenantSlug });
  const { apiKey, deviceId } = await claimProvisionToken({ label, tenantSlug, token: provToken });

  // Ensure ACTIVE event and bind device
  const smokeEventId = await createAndActivateSmokeEvent({ label, cookie });
  await patchDevice({ label, cookie, deviceId, activeEventId: smokeEventId });

  // Forms
  let forms = await listMobileForms({ label, tenantSlug, apiKey });

  if (!forms.length) {
    console.warn(`⚠️  [${label}] forms list empty. Trying auto-assign via Admin...`);

    const adminForms = await listAdminActiveForms({ label, cookie });
    const pick = adminForms.find((f) => isRecord(f) && typeof f.id === "string" && f.id.trim());
    const formId = pick && isRecord(pick) ? String(pick.id) : "";

    if (!formId) {
      throw new Error(`[${label}] forms list empty AND no admin forms found. Create at least one ACTIVE form and rerun.`);
    }

    await assignFormToDevice({ label, cookie, deviceId, formId });
    await sleep(150);

    await verifyDeviceAssignments({ label, cookie, deviceId });
    await sleep(150);

    forms = await listMobileForms({ label, tenantSlug, apiKey });
  }

  if (!forms.length) {
    throw new Error(`[${label}] forms list still empty after auto-assign. Check assignment model and that form status is ACTIVE.`);
  }

  const picked = forms.find((f) => isRecord(f) && typeof f.id === "string" && f.id.trim()) || forms[0];
  const formId = isRecord(picked) && typeof picked.id === "string" ? picked.id : "";
  if (!formId) throw new Error(`[${label}] forms ok but could not pick formId`);

  console.log(`✅ [${label}] forms ok; picked formId=${formId}`);

  // Lead create (fix: always include capturedAt + values)
  await createLead({ label, tenantSlug, apiKey, formId });

  console.log(`✅ [${label}] mobile smoke PASSED`);
}

async function main() {
  console.log(`Mobile smoke against: ${baseUrl}`);
  const failed = [];

  for (const c of checks) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await mainForTenant(c);
    } catch (e) {
      console.error(`❌ [${c.label}] mobile smoke FAILED:`, e?.message || e);
      failed.push(c.label);
    }
  }

  if (failed.length) {
    console.error(`\nMobile smoke FAILED for: ${failed.join(", ")}`);
    process.exit(1);
  }

  console.log("\nMobile smoke ALL tenants PASSED.");
}

main().catch((e) => {
  console.error("❌ mobile:smoke crashed:", e?.message || e);
  process.exit(1);
});
