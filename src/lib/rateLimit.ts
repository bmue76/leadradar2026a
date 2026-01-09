/* eslint-disable no-console */

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
