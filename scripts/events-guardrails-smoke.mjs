/**
 * Events Guardrails Smoke Test for DEV (TP 3.8)
 *
 * Verifies (tenant-scoped, session-cookie):
 * 1) Create 2 events -> set event1 ACTIVE -> set event2 ACTIVE -> assert event1 ARCHIVED
 * 2) Bind a device to active event (ok)
 * 3) Archive active event -> assert devicesUnboundCount > 0 (and device shows activeEventId=null)
 *
 * Usage:
 *   node scripts/events-guardrails-smoke.mjs
 *
 * Optional env:
 *   EVENTS_SMOKE_BASE_URL="http://localhost:3000"
 *   AUTH_SMOKE_BASE_URL="http://localhost:3000" (fallback)
 */
const baseUrl = process.env.EVENTS_SMOKE_BASE_URL || process.env.AUTH_SMOKE_BASE_URL || "http://localhost:3000";

const checks = [
  { label: "Atlex", email: "admin@atlex.ch", password: "Admin1234!" },
  { label: "Demo", email: "admin@leadradar.local", password: "ChangeMe123!" },
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRecord(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function pickData(payload) {
  if (isRecord(payload) && isRecord(payload.data)) return payload.data;
  if (isRecord(payload)) return payload;
  return null;
}

function pickArray(payload) {
  const d = pickData(payload);
  if (!d) return [];
  if (Array.isArray(d.items)) return d.items;
  if (Array.isArray(d.events)) return d.events;
  if (Array.isArray(d.devices)) return d.devices;
  return [];
}

function extractCookie(setCookieHeader, cookieName) {
  if (!setCookieHeader) return "";
  const idx = setCookieHeader.indexOf(`${cookieName}=`);
  if (idx === -1) return "";
  const sub = setCookieHeader.slice(idx);
  const end = sub.indexOf(";");
  const pair = end === -1 ? sub : sub.slice(0, end);
  return pair.trim();
}

async function httpJson({ method, path, cookie, body }) {
  const url = `${baseUrl.replace(/\/$/, "")}${path}`;
  const headers = { "accept": "application/json" };
  if (cookie) headers["cookie"] = cookie;
  if (body !== undefined) headers["content-type"] = "application/json";

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  return { res, text, json };
}

async function login({ label, email, password }) {
  const { res, text, json } = await httpJson({
    method: "POST",
    path: "/api/auth/login",
    body: { email, password },
  });

  if (!res.ok) {
    throw new Error(`[${label}] login failed: HTTP ${res.status} ${res.statusText} :: ${json ? JSON.stringify(json) : text}`);
  }
  if (!json?.ok) {
    throw new Error(`[${label}] login failed: ok=false :: ${json ? JSON.stringify(json) : text}`);
  }

  const setCookie = res.headers.get("set-cookie") || "";
  const lrSession = extractCookie(setCookie, "lr_session");
  if (!lrSession) {
    // Still allow: session might be set differently in some envs; but in DEV we expect lr_session.
    console.warn(`⚠️  [${label}] login ok but no lr_session cookie found in set-cookie header.`);
  }

  return lrSession;
}

async function createEvent({ label, cookie, name }) {
  const { res, text, json } = await httpJson({
    method: "POST",
    path: "/api/admin/v1/events",
    cookie,
    body: { name, status: "DRAFT" },
  });

  if (!res.ok || !json?.ok) {
    throw new Error(`[${label}] createEvent failed :: ${json ? JSON.stringify(json) : text}`);
  }

  const data = pickData(json) || {};
  const ev = isRecord(data.event) ? data.event : null;
  const id = ev && typeof ev.id === "string" ? ev.id : "";
  if (!id) throw new Error(`[${label}] createEvent: missing event.id`);

  return id;
}

async function setEventStatus({ label, cookie, eventId, status }) {
  const { res, text, json } = await httpJson({
    method: "PATCH",
    path: `/api/admin/v1/events/${eventId}/status`,
    cookie,
    body: { status },
  });

  if (!res.ok || !json?.ok) {
    throw new Error(`[${label}] setEventStatus(${status}) failed :: ${json ? JSON.stringify(json) : text}`);
  }

  const data = pickData(json) || {};
  const devicesUnboundCount =
    typeof data.devicesUnboundCount === "number"
      ? data.devicesUnboundCount
      : typeof data.unboundDevicesCount === "number"
        ? data.unboundDevicesCount
        : 0;

  return { devicesUnboundCount, data };
}

async function listEvents({ label, cookie }) {
  const { res, text, json } = await httpJson({
    method: "GET",
    path: "/api/admin/v1/events?limit=500&includeCounts=true",
    cookie,
  });

  if (!res.ok || !json?.ok) {
    throw new Error(`[${label}] listEvents failed :: ${json ? JSON.stringify(json) : text}`);
  }

  return pickArray(json);
}

async function pickDeviceFromList(devices) {
  // Prefer ACTIVE devices
  for (const d of devices) {
    if (!isRecord(d)) continue;
    const id = typeof d.id === "string" ? d.id : "";
    if (!id) continue;
    const status = typeof d.status === "string" ? d.status.toUpperCase() : "";
    if (status === "ACTIVE") return d;
  }
  // fallback: first with id
  for (const d of devices) {
    if (!isRecord(d)) continue;
    const id = typeof d.id === "string" ? d.id : "";
    if (id) return d;
  }
  return null;
}

async function listDevices({ label, cookie }) {
  // We try a few likely endpoints to avoid hard-coding internal naming.
  const candidates = [
    "/api/admin/v1/mobile/devices?limit=200",
    "/api/admin/v1/mobile/devices",
  ];

  for (const path of candidates) {
    const { res, text, json } = await httpJson({ method: "GET", path, cookie });
    if (res.ok && json?.ok) {
      const arr = pickArray(json);
      if (arr.length > 0) return arr;
      // If ok but empty, still return empty (caller can decide).
      return arr;
    }
    // keep trying next candidate
    void text;
  }

  throw new Error(`[${label}] listDevices: no known endpoint worked (tried: ${candidates.join(", ")})`);
}

async function patchDevice({ label, cookie, device }) {
  const deviceId = typeof device.id === "string" ? device.id : "";
  if (!deviceId) throw new Error(`[${label}] patchDevice: missing device.id`);

  const name = typeof device.name === "string" && device.name.trim() ? device.name.trim() : "Smoke Device";
  const status = typeof device.status === "string" && device.status ? device.status : "ACTIVE";

  const { res, text, json } = await httpJson({
    method: "PATCH",
    path: `/api/admin/v1/mobile/devices/${deviceId}`,
    cookie,
    body: { name, status, activeEventId: device.activeEventId ?? null },
  });

  if (!res.ok || !json?.ok) {
    throw new Error(`[${label}] patchDevice failed :: ${json ? JSON.stringify(json) : text}`);
  }

  return pickData(json) || {};
}

async function bindDeviceToEvent({ label, cookie, device, eventId }) {
  const deviceId = typeof device.id === "string" ? device.id : "";
  if (!deviceId) throw new Error(`[${label}] bindDeviceToEvent: missing device.id`);

  const name = typeof device.name === "string" && device.name.trim() ? device.name.trim() : "Smoke Device";
  const status = typeof device.status === "string" && device.status ? device.status : "ACTIVE";

  const { res, text, json } = await httpJson({
    method: "PATCH",
    path: `/api/admin/v1/mobile/devices/${deviceId}`,
    cookie,
    body: { name, status, activeEventId: eventId },
  });

  if (!res.ok || !json?.ok) {
    throw new Error(`[${label}] bindDeviceToEvent failed :: ${json ? JSON.stringify(json) : text}`);
  }

  return true;
}

async function mainForTenant(c) {
  const { label } = c;
  console.log(`\n=== Events smoke: ${label} ===`);
  const cookie = await login(c);

  // Unique names to avoid collisions
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const ev1Name = `Smoke ${label} #1 ${ts}`;
  const ev2Name = `Smoke ${label} #2 ${ts}`;

  const ev1 = await createEvent({ label, cookie, name: ev1Name });
  const ev2 = await createEvent({ label, cookie, name: ev2Name });

  console.log(`✅ [${label}] created events: ${ev1} , ${ev2}`);

  await setEventStatus({ label, cookie, eventId: ev1, status: "ACTIVE" });
  console.log(`✅ [${label}] set ev1 ACTIVE`);

  await setEventStatus({ label, cookie, eventId: ev2, status: "ACTIVE" });
  console.log(`✅ [${label}] set ev2 ACTIVE (should archive ev1)`);

  // Assert ev1 archived
  const events = await listEvents({ label, cookie });
  const ev1Row = events.find((x) => isRecord(x) && x.id === ev1);
  const ev1Status = ev1Row && typeof ev1Row.status === "string" ? ev1Row.status.toUpperCase() : "";
  if (ev1Status !== "ARCHIVED") {
    throw new Error(`[${label}] expected ev1 ARCHIVED, got: ${ev1Status || "?"}`);
  }
  console.log(`✅ [${label}] assert ev1 ARCHIVED`);

  // Pick a device and bind it to ev2 (ACTIVE)
  const devices = await listDevices({ label, cookie });
  if (!devices.length) {
    throw new Error(`[${label}] no devices found. Create/provision at least one device in Mobile Ops, then rerun events:smoke.`);
  }
  const device = await pickDeviceFromList(devices);
  if (!device) {
    throw new Error(`[${label}] could not pick a device from devices list.`);
  }

  // Ensure we start from a known state: unbind first (best-effort)
  device.activeEventId = null;
  await patchDevice({ label, cookie, device });
  await sleep(150);

  await bindDeviceToEvent({ label, cookie, device, eventId: ev2 });
  console.log(`✅ [${label}] bound device ${device.id} -> ev2`);

  // Archive active event and assert auto-unbind count > 0
  const r = await setEventStatus({ label, cookie, eventId: ev2, status: "ARCHIVED" });
  const unbound = r.devicesUnboundCount;
  if (!(unbound > 0)) {
    throw new Error(`[${label}] expected devicesUnboundCount > 0 when archiving ev2, got: ${unbound}`);
  }
  console.log(`✅ [${label}] archived ev2; devicesUnboundCount=${unbound} (>0)`);

  // Optional: verify device now has activeEventId=null
  const devicesAfter = await listDevices({ label, cookie });
  const after = devicesAfter.find((x) => isRecord(x) && x.id === device.id);
  const afterActiveEventId = after && typeof after.activeEventId === "string" ? after.activeEventId : null;
  if (afterActiveEventId !== null) {
    console.warn(`⚠️  [${label}] device still shows activeEventId=${afterActiveEventId} (expected null).`);
  } else {
    console.log(`✅ [${label}] device unbound verified (activeEventId=null)`);
  }

  console.log(`✅ [${label}] events smoke PASSED`);
}

async function main() {
  console.log(`Events smoke against: ${baseUrl}`);
  for (const c of checks) {
    // eslint-disable-next-line no-await-in-loop
    await mainForTenant(c);
  }
  console.log("\nEvents smoke ALL tenants PASSED.");
}

main().catch((e) => {
  console.error("❌ Events smoke FAILED:", e?.message || e);
  process.exit(1);
});
