import { httpError } from "@/lib/http";

/**
 * Best-effort in-memory rate limiting.
 * NOTE: In serverless/multi-instance environments this is NOT strict.
 * Later: Redis/Upstash.
 */
type Bucket = { count: number; resetAtMs: number };

const buckets = new Map<string, Bucket>();

export type RateLimitConfig = {
  limit: number; // requests per window
  windowMs: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAtMs: number;
};

export function checkRateLimit(key: string, cfg: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  const b = buckets.get(key);

  if (!b || now >= b.resetAtMs) {
    const resetAtMs = now + cfg.windowMs;
    buckets.set(key, { count: 1, resetAtMs });
    return { allowed: true, remaining: cfg.limit - 1, resetAtMs };
  }

  if (b.count >= cfg.limit) {
    return { allowed: false, remaining: 0, resetAtMs: b.resetAtMs };
  }

  b.count += 1;
  buckets.set(key, b);
  return { allowed: true, remaining: cfg.limit - b.count, resetAtMs: b.resetAtMs };
}

export function enforceRateLimit(key: string, cfg: RateLimitConfig) {
  const res = checkRateLimit(key, cfg);
  if (!res.allowed) {
    const retryAfterSec = Math.max(1, Math.ceil((res.resetAtMs - Date.now()) / 1000));
    throw httpError(429, "RATE_LIMITED", "Too many requests.", {
      retryAfterSec,
      resetAt: new Date(res.resetAtMs).toISOString(),
    });
  }
  return res;
}
