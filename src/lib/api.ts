type JsonValue = unknown;

function fallbackId() {
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

export function getTraceId(req: Request): string {
  const h = req.headers;
  return (
    h.get("x-trace-id") ||
    h.get("x-request-id") ||
    h.get("x-vercel-id") ||
    (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : fallbackId())
  );
}

function withTraceHeaders(traceId: string, init?: ResponseInit): HeadersInit {
  const base: Record<string, string> = {
    "content-type": "application/json; charset=utf-8",
    "x-trace-id": traceId,
  };
  const extra = init?.headers ? Object.fromEntries(new Headers(init.headers).entries()) : {};
  return { ...base, ...extra };
}

export function jsonOk(req: Request, data: JsonValue, init?: ResponseInit) {
  const traceId = getTraceId(req);
  return new Response(JSON.stringify({ ok: true, data, traceId }), {
    ...init,
    status: init?.status ?? 200,
    headers: withTraceHeaders(traceId, init),
  });
}

export function jsonError(
  req: Request,
  status: number,
  code: string,
  message: string,
  details?: JsonValue,
  init?: ResponseInit
) {
  const traceId = getTraceId(req);
  return new Response(JSON.stringify({ ok: false, error: { code, message, details }, traceId }), {
    ...init,
    status,
    headers: withTraceHeaders(traceId, init),
  });
}
