import { z } from "zod";

export class HttpError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function isHttpError(e: unknown): e is HttpError {
  return e instanceof HttpError;
}

export function httpError(status: number, code: string, message: string, details?: unknown) {
  return new HttpError(status, code, message, details);
}

export async function parseJson(req: Request, maxBytes = 1024 * 1024): Promise<unknown | undefined> {
  const contentLength = req.headers.get("content-length");
  if (contentLength) {
    const n = Number(contentLength);
    if (Number.isFinite(n) && n > maxBytes) throw httpError(413, "BODY_TOO_LARGE", "Request body too large.");
  }

  const text = await req.text();
  if (!text.trim()) return undefined;
  if (text.length > maxBytes) throw httpError(413, "BODY_TOO_LARGE", "Request body too large.");

  try {
    return JSON.parse(text);
  } catch {
    throw httpError(400, "BAD_JSON", "Invalid JSON.");
  }
}

export async function validateBody<T extends z.ZodTypeAny>(
  req: Request,
  schema: T,
  maxBytes?: number
): Promise<z.infer<T>> {
  const raw = await parseJson(req, maxBytes);
  const res = schema.safeParse(raw ?? {});
  if (!res.success) throw httpError(400, "INVALID_BODY", "Invalid request body.", res.error.flatten());
  return res.data;
}

export function validateQuery<T extends z.ZodTypeAny>(req: Request, schema: T): z.infer<T> {
  const url = new URL(req.url);
  const obj: Record<string, string> = {};
  for (const [k, v] of url.searchParams.entries()) obj[k] = v;

  const res = schema.safeParse(obj);
  if (!res.success) throw httpError(400, "INVALID_QUERY", "Invalid query string.", res.error.flatten());
  return res.data;
}
