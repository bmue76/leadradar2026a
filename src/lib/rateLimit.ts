import { httpError } from "@/lib/http";

type Bucket = { count: number; resetAtMs: number };

// Keep state across Next.js dev HMR (best-effort, Phase 1).
const globalForRl = globalThis as unknown as { __lr_rate_limit__?: Map<string, Bucket> };
const BUCKETS = (globalForRl.__lr_rate_limit__ ??= new Map<string, Bucket>());

function nowMs() {
  return Date.now();
}

function cleanupExpired(now: number) {
  // best-effort cleanup to avoid unbounded growth
  if (BUCKETS.size < 2000) return;
  for (const [k, v] of BUCKETS.entries()) {
    if (v.resetAtMs <= now) BUCKETS.delete(k);
  }
}

export type RateLimitResult =
  | { ok: true; limit: number; remaining: number; resetAtMs: number }
  | { ok: false; limit: number; remaining: 0; retryAfterSec: number; resetAtMs: number };

export function rateLimitCheck(opts: {
  key: string;
  limit: number;
  windowSec: number;
  now?: number;
}): RateLimitResult {
  const now = opts.now ?? nowMs();
  cleanupExpired(now);

  const windowMs = Math.max(1, Math.floor(opts.windowSec * 1000));
  const existing = BUCKETS.get(opts.key);

  if (!existing || existing.resetAtMs <= now) {
    const resetAtMs = now + windowMs;
    BUCKETS.set(opts.key, { count: 1, resetAtMs });
    return { ok: true, limit: opts.limit, remaining: Math.max(0, opts.limit - 1), resetAtMs };
  }

  if (existing.count >= opts.limit) {
    const retryAfterSec = Math.max(1, Math.ceil((existing.resetAtMs - now) / 1000));
    return { ok: false, limit: opts.limit, remaining: 0, retryAfterSec, resetAtMs: existing.resetAtMs };
  }

  existing.count += 1;
  BUCKETS.set(opts.key, existing);

  return {
    ok: true,
    limit: opts.limit,
    remaining: Math.max(0, opts.limit - existing.count),
    resetAtMs: existing.resetAtMs,
  };
}

export function getClientIp(req: Request): string {
  const h = req.headers;

  const xff = h.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = h.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const cf = h.get("cf-connecting-ip")?.trim();
  if (cf) return cf;

  // dev fallback
  return "127.0.0.1";
}

type EnforceOpts = { limit: number; windowMs?: number; windowSec?: number };

/**
 * Backwards-compatible helper used across Mobile API routes.
 *
 * Supported call styles:
 *   (A) enforceRateLimit(key, { limit, windowMs })
 *   (B) enforceRateLimit(key, { limit, windowSec })
 *   (C) enforceRateLimit(req, key, limit, windowSec?)
 *   (D) enforceRateLimit(req, { key, limit, windowMs|windowSec })
 *
 * Throws httpError(429, RATE_LIMITED, ...) when exceeded.
 */
export function enforceRateLimit(key: string, opts: { limit: number; windowMs: number }): void;
export function enforceRateLimit(key: string, opts: { limit: number; windowSec: number }): void;
export function enforceRateLimit(req: Request, key: string, limit: number, windowSec?: number): void;
export function enforceRateLimit(req: Request, opts: { key: string; limit: number; windowMs?: number; windowSec?: number }): void;
export function enforceRateLimit(...args: unknown[]): void {
  // Parse arguments
  let key: string | null = null;
  let limit = 10;
  let windowSec = 60;

  const first = args[0];

  // Style A/B: (key: string, opts: {limit, windowMs|windowSec})
  if (typeof first === "string") {
    key = first;
    const opts = args[1] as EnforceOpts | undefined;

    if (opts && typeof opts === "object") {
      if (typeof opts.limit === "number" && Number.isFinite(opts.limit)) limit = Math.floor(opts.limit);
      if (typeof opts.windowSec === "number" && Number.isFinite(opts.windowSec)) windowSec = Math.max(1, Math.floor(opts.windowSec));
      if (typeof opts.windowMs === "number" && Number.isFinite(opts.windowMs)) windowSec = Math.max(1, Math.floor(opts.windowMs / 1000));
    }
  } else {
    // Style C/D: (req, ...)
    const maybeReq = first as Request | undefined;
    void maybeReq;

    const second = args[1];

    if (typeof second === "string") {
      // (req, key, limit, windowSec?)
      key = second;
      const lim = args[2] as number | undefined;
      const win = args[3] as number | undefined;

      if (typeof lim === "number" && Number.isFinite(lim)) limit = Math.floor(lim);
      if (typeof win === "number" && Number.isFinite(win)) windowSec = Math.max(1, Math.floor(win));
    } else if (second && typeof second === "object") {
      // (req, { key, limit, windowMs|windowSec })
      const opts = second as { key?: unknown; limit?: unknown; windowMs?: unknown; windowSec?: unknown };
      if (typeof opts.key === "string") key = opts.key;

      if (typeof opts.limit === "number" && Number.isFinite(opts.limit)) limit = Math.floor(opts.limit);
      if (typeof opts.windowSec === "number" && Number.isFinite(opts.windowSec)) windowSec = Math.max(1, Math.floor(opts.windowSec));
      if (typeof opts.windowMs === "number" && Number.isFinite(opts.windowMs)) windowSec = Math.max(1, Math.floor(opts.windowMs / 1000));
    }
  }

  if (!key || !key.trim()) {
    throw httpError(500, "INTERNAL_ERROR", "Rate limit misconfigured.");
  }

  const r = rateLimitCheck({ key, limit, windowSec });
  if (!r.ok) {
    throw httpError(429, "RATE_LIMITED", "Too many requests.", { retryAfterSec: r.retryAfterSec });
  }
}
