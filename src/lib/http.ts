/**
 * LeadRadar2026A – HTTP Helpers
 * Centralized error + parsing + Zod validation
 */

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

export function httpError(status: number, code: string, message: string, details?: unknown): HttpError {
  return new HttpError(status, code, message, details);
}

export async function parseJson(req: Request, maxBytes = 1024 * 1024): Promise<unknown | undefined> {
  const text = await req.text();
  if (!text.trim()) return undefined;

  if (text.length > maxBytes) {
    throw httpError(413, "BODY_TOO_LARGE", "Request body too large.");
  }

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
  if (!res.success) {
    throw httpError(400, "INVALID_BODY", "Invalid request body.", res.error.flatten());
  }
  return res.data;
}

function searchParamsToObject(sp: URLSearchParams): Record<string, string | string[]> {
  const keys = Array.from(new Set(Array.from(sp.keys())));
  const out: Record<string, string | string[]> = {};
  for (const key of keys) {
    const all = sp.getAll(key).filter((v) => v !== null);
    if (all.length <= 1) out[key] = all[0] ?? "";
    else out[key] = all;
  }
  return out;
}

export async function validateQuery<T extends z.ZodTypeAny>(req: Request, schema: T): Promise<z.infer<T>> {
  const url = new URL(req.url);
  const raw = searchParamsToObject(url.searchParams);
  const res = schema.safeParse(raw);
  if (!res.success) {
    throw httpError(400, "INVALID_QUERY", "Invalid query string.", res.error.flatten());
  }
  return res.data;
}
