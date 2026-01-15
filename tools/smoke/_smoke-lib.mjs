/**
 * Smoke shared helpers (TP 4.0)
 * - Robust jsonOk parsing
 * - Works with jsonOk(req, array) as well as jsonOk(req, { items: [...] })
 * - tryJsonOk now reports meaningful error info (code/message/details) for 4xx responses
 */

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function isRecord(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function deepFindString(root, keys) {
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

export function extractCookiePair(setCookieHeader, cookieName) {
  if (!setCookieHeader) return "";
  const idx = setCookieHeader.indexOf(`${cookieName}=`);
  if (idx === -1) return "";
  const sub = setCookieHeader.slice(idx);
  const end = sub.indexOf(";");
  const pair = end === -1 ? sub : sub.slice(0, end);
  return pair.trim();
}

export async function httpJson({ baseUrl, method, path, headers, cookie, body, timeoutMs }) {
  const url = `${String(baseUrl).replace(/\/$/, "")}${path}`;
  const h = { accept: "application/json", ...(headers || {}) };
  if (cookie) h.cookie = cookie;

  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const to = timeoutMs ? setTimeout(() => ctrl?.abort(), timeoutMs) : null;

  let res;
  let text = "";
  let json = null;

  try {
    res = await fetch(url, {
      method,
      headers: h,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctrl?.signal,
    });

    text = await res.text();
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  } finally {
    if (to) clearTimeout(to);
  }

  return { res, text, json };
}

/**
 * jsonOk contract (expected):
 * - { ok: true, data: ... , traceId?: string }
 * - header x-trace-id present
 */
export function assertOkAllowMissingTraceId({ label, res, text, json }) {
  if (!res.ok) {
    throw new Error(`[${label}] HTTP ${res.status} ${res.statusText} :: ${json ? JSON.stringify(json) : text}`);
  }
  if (!json || json.ok !== true) {
    throw new Error(`[${label}] ok=false :: ${json ? JSON.stringify(json) : text}`);
  }
  // traceId may be missing on legacy endpoints (allowed here)
  const hdr = (res.headers.get("x-trace-id") || "").trim();
  const bodyTrace = isRecord(json) && typeof json.traceId === "string" ? json.traceId : "";
  if (!hdr && !bodyTrace) {
    // warn only
    console.warn(`⚠️  [${label}] missing traceId (allowed for this endpoint).`);
  }
}

export function pickItemsArray(payload) {
  // Accept jsonOk(req, array) and jsonOk(req, { items: [...] }) and common variants.
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;

  if (isRecord(payload) && payload.ok === true) {
    const d = isRecord(payload) ? payload.data : null;

    if (Array.isArray(d)) return d;

    if (isRecord(d)) {
      if (Array.isArray(d.items)) return d.items;
      if (Array.isArray(d.forms)) return d.forms;
      if (Array.isArray(d.events)) return d.events;
      if (Array.isArray(d.devices)) return d.devices;
      if (Array.isArray(d.exports)) return d.exports;
      if (Array.isArray(d.jobs)) return d.jobs;
      if (Array.isArray(d.rows)) return d.rows;
    }

    // Sometimes jsonOk(req, { ... }) but the array is nested somewhere else
    const nested = deepFindAnyArray(d);
    if (nested) return nested;
  }

  return [];
}

function deepFindAnyArray(node) {
  const seen = new Set();
  function walk(x) {
    if (!x || typeof x !== "object") return null;
    if (seen.has(x)) return null;
    seen.add(x);

    if (Array.isArray(x)) return x;

    for (const v of Object.values(x)) {
      const r = walk(v);
      if (r) return r;
    }
    return null;
  }
  return walk(node);
}

function summarizeError(json, text) {
  const parts = [];

  if (isRecord(json)) {
    const traceId = typeof json.traceId === "string" ? json.traceId : "";
    if (traceId) parts.push(`traceId=${traceId}`);

    // Common jsonError shapes:
    // A) { ok:false, code, message, details, traceId }
    // B) { ok:false, error:{ code, message, details }, traceId }
    const codeTop = typeof json.code === "string" ? json.code : "";
    const msgTop = typeof json.message === "string" ? json.message : "";

    const errObj = isRecord(json.error) ? json.error : null;
    const codeErr = errObj && typeof errObj.code === "string" ? errObj.code : "";
    const msgErr = errObj && typeof errObj.message === "string" ? errObj.message : "";

    const code = codeTop || codeErr;
    const msg = msgTop || msgErr;

    if (code) parts.push(`code=${code}`);
    if (msg) parts.push(`msg=${msg}`);

    const details = json.details || (errObj ? errObj.details : null);
    if (details !== undefined) {
      let d = "";
      try {
        d = JSON.stringify(details);
      } catch {
        d = String(details);
      }
      if (d && d.length > 180) d = d.slice(0, 180) + "…";
      if (d) parts.push(`details=${d}`);
    }
  }

  if (!parts.length) {
    const t = (text || "").trim();
    if (!t) return "";
    return t.length > 220 ? t.slice(0, 220) + "…" : t;
  }

  return parts.join(" ");
}

export async function tryJsonOk({ baseUrl, label, candidates, timeoutMs }) {
  const errs = [];
  for (const c of candidates) {
    const { method, path, headers, cookie, body } = c;
    const r = await httpJson({ baseUrl, method, path, headers, cookie, body, timeoutMs });
    const ok = r.res.ok && r.json && r.json.ok === true;
    if (ok) return r;

    const info = (r.res.status >= 400 && r.res.status < 500) ? summarizeError(r.json, r.text) : "";
    errs.push(`- ${method} ${path} -> HTTP ${r.res.status} ${r.res.statusText}${info ? ` :: ${info}` : ""}`);
  }
  throw new Error(`[${label}] no candidate worked. Tried:\n${errs.join("\n")}`);
}

/**
 * Heuristic: produce minimal values object for lead creation.
 * If form has fields array, try to fill first few string-ish keys.
 */
export function buildSmokeValuesFromForm(form) {
  const base = {
    _smoke: "1",
    name: "Smoke Tester",
    email: "smoke@example.com",
    company: "LeadRadar Smoke",
  };

  if (!isRecord(form)) return base;

  // common shapes: { fields: [...] } or { schema: { fields: [...] } }
  const fields =
    (Array.isArray(form.fields) && form.fields) ||
    (isRecord(form.schema) && Array.isArray(form.schema.fields) && form.schema.fields) ||
    null;

  if (!fields) return base;

  const out = { ...base };
  let filled = 0;

  for (const f of fields) {
    if (!isRecord(f)) continue;
    const key =
      (typeof f.key === "string" && f.key.trim()) ||
      (typeof f.id === "string" && f.id.trim()) ||
      (typeof f.name === "string" && f.name.trim()) ||
      "";

    if (!key) continue;
    if (Object.prototype.hasOwnProperty.call(out, key)) continue;

    out[key] = `smoke_${key}`;
    filled += 1;
    if (filled >= 6) break;
  }

  return out;
}
