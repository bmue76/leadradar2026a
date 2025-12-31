/**
 * LeadRadar2026A – API Response Helpers
 * Standard response shape + traceId propagation.
 */

function generateTraceId(): string {
  // Works in Node + Edge (Web Crypto), fallback for exotic runtimes.
  const cryptoObj = globalThis.crypto;

  // Type-safe check (works even if TS libs don't know randomUUID)
  const hasRandomUUID =
    typeof cryptoObj !== "undefined" &&
    "randomUUID" in cryptoObj &&
    typeof (cryptoObj as unknown as { randomUUID?: unknown }).randomUUID === "function";

  if (hasRandomUUID) {
    return (cryptoObj as unknown as { randomUUID: () => string }).randomUUID();
  }

  // Fallback: stable enough for dev.
  return `trace_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getTraceId(req: Request): string {
  const h = req.headers;
  return (
    h.get("x-trace-id") ||
    h.get("x-request-id") ||
    h.get("x-vercel-id") ||
    generateTraceId()
  );
}

function mergeHeaders(base: HeadersInit | undefined, extra: Record<string, string>): HeadersInit {
  const out = new Headers(base || {});
  for (const [k, v] of Object.entries(extra)) out.set(k, v);
  return out;
}

export function jsonOk(req: Request, data: unknown, init?: ResponseInit): Response {
  const traceId = getTraceId(req);
  return new Response(JSON.stringify({ ok: true, data, traceId }), {
    ...init,
    headers: mergeHeaders(init?.headers, {
      "content-type": "application/json; charset=utf-8",
      "x-trace-id": traceId,
    }),
  });
}

export function jsonError(
  req: Request,
  status: number,
  code: string,
  message: string,
  details?: unknown,
  init?: ResponseInit
): Response {
  const traceId = getTraceId(req);
  return new Response(JSON.stringify({ ok: false, error: { code, message, details }, traceId }), {
    status,
    ...init,
    headers: mergeHeaders(init?.headers, {
      "content-type": "application/json; charset=utf-8",
      "x-trace-id": traceId,
    }),
  });
}
