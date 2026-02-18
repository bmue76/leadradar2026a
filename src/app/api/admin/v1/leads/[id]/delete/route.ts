export const runtime = "nodejs";

import { PrismaClient } from "@prisma/client";

type ApiOk<T> = { ok: true; data: T; traceId: string };
type ApiErr = { ok: false; error: { code: string; message: string; details?: unknown }; traceId: string };
type ApiResp<T> = ApiOk<T> | ApiErr;

declare global {
  // eslint-disable-next-line no-var
  var __lr_prisma: PrismaClient | undefined;
}

const prisma = globalThis.__lr_prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalThis.__lr_prisma = prisma;

export async function POST(req: Request, ctx: { params: { id: string } }) {
  const traceId = crypto.randomUUID();
  const { id } = ctx.params;

  try {
    const url = new URL(req.url);
    const base = `${url.protocol}//${url.host}`;

    // Auth/scoping gate: reuse existing lead-detail endpoint.
    const gate = await fetch(`${base}/api/admin/v1/leads/${id}`, {
      method: "GET",
      headers: req.headers,
      cache: "no-store",
    });

    const gateJson = (await gate.json()) as ApiResp<unknown>;
    if (!gateJson || typeof gateJson !== "object") {
      return Response.json(
        { ok: false, error: { code: "BAD_RESPONSE", message: "Ungültige Serverantwort." }, traceId } satisfies ApiErr,
        { status: 502 }
      );
    }
    if (!gateJson.ok) {
      return Response.json(gateJson, { status: gate.status || 400 });
    }

    // Best-effort cascade delete (falls Models existieren)
    const p = prisma as any;

    await p.leadAttachment?.deleteMany?.({ where: { leadId: id } }).catch(() => undefined);
    await p.leadOcrResult?.deleteMany?.({ where: { leadId: id } }).catch(() => undefined);
    await p.leadOcr?.deleteMany?.({ where: { leadId: id } }).catch(() => undefined);
    await p.leadEventValue?.deleteMany?.({ where: { leadId: id } }).catch(() => undefined);

    // Primary delete (Prisma Model i.d.R. "lead")
    const deleted = await p.lead?.delete?.({ where: { id } }).catch(async (e: unknown) => {
      // fallback: deleteMany
      const r = await p.lead?.deleteMany?.({ where: { id } }).catch(() => null);
      if (r && typeof r.count === "number" && r.count > 0) return { id };
      throw e;
    });

    if (!deleted) {
      return Response.json(
        { ok: false, error: { code: "DELETE_FAILED", message: "Konnte Lead nicht löschen." }, traceId } satisfies ApiErr,
        { status: 500 }
      );
    }

    return Response.json({ ok: true, data: { deleted: true }, traceId } satisfies ApiOk<{ deleted: boolean }>, {
      status: 200,
      headers: { "x-trace-id": traceId },
    });
  } catch (e) {
    return Response.json(
      { ok: false, error: { code: "DELETE_FAILED", message: "Konnte Lead nicht löschen.", details: String(e) }, traceId } satisfies ApiErr,
      { status: 500 }
    );
  }
}
