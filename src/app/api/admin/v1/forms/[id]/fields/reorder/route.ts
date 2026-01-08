import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "node:crypto";

type RouteCtx = { params: Promise<{ id: string }> };

function traceId() {
  try {
    return randomUUID();
  } catch {
    return `trace_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

function ok<T>(data: T, tid: string) {
  return NextResponse.json({ ok: true, data, traceId: tid }, { status: 200 });
}

function err(status: number, code: string, message: string, tid: string) {
  return NextResponse.json({ ok: false, error: { code, message }, traceId: tid }, { status });
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function uniqPreserve(xs: string[]) {
  return Array.from(new Set(xs));
}

async function handle(req: NextRequest, ctx: RouteCtx) {
  const tid = traceId();

  const { id } = await ctx.params;
  const formId = String(id || "").trim();
  if (!formId) return err(400, "BAD_REQUEST", "Missing form id.", tid);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err(400, "BAD_REQUEST", "Invalid JSON body.", tid);
  }

  if (!isRecord(body)) return err(400, "BAD_REQUEST", "Invalid body.", tid);

  // Client sends { order: [...] } — we also accept { orderedIds: [...] }
  const raw = (body.orderedIds ?? body.order) as unknown;
  if (!Array.isArray(raw)) return err(400, "BAD_REQUEST", "Body must include order (array).", tid);

  const orderedIds = uniqPreserve(
    raw.map((x) => String(x)).map((s) => s.trim()).filter(Boolean)
  );
  if (orderedIds.length === 0) return err(400, "BAD_REQUEST", "order must not be empty.", tid);

  // Optional safety net (adminFetchJson typically sends this)
  const tenantSlug = req.headers.get("x-tenant-slug")?.trim() || "";

  const form = await prisma.form.findFirst({
    where: { id: formId },
    select: { id: true, tenantId: true },
  });
  if (!form) return err(404, "NOT_FOUND", "Form not found.", tid);

  if (tenantSlug) {
    const tenant = await prisma.tenant.findUnique({
      where: { slug: tenantSlug },
      select: { id: true },
    });
    if (!tenant || tenant.id !== form.tenantId) {
      // leak-safe
      return err(404, "NOT_FOUND", "Form not found.", tid);
    }
  }

  const fields = await prisma.formField.findMany({
    where: { formId, tenantId: form.tenantId },
    select: { id: true },
  });

  const existingIds = fields.map((f) => f.id);
  const existingSet = new Set(existingIds);

  // Must be a full permutation of this form's fields
  if (orderedIds.some((fid) => !existingSet.has(fid))) {
    return err(400, "BAD_REQUEST", "order contains unknown field ids.", tid);
  }
  if (orderedIds.length !== existingIds.length) {
    return err(400, "BAD_REQUEST", "order must include ALL fields of this form.", tid);
  }

  // Persist sortOrder (10,20,30,...)
  await prisma.$transaction(
    orderedIds.map((fid, idx) =>
      prisma.formField.updateMany({
        where: { id: fid, formId, tenantId: form.tenantId },
        data: { sortOrder: (idx + 1) * 10 },
      })
    )
  );

  return ok({ formId, updated: orderedIds.length, orderedIds }, tid);
}

export async function POST(req: NextRequest, ctx: RouteCtx) {
  return handle(req, ctx);
}

// optional: allow PUT as well
export async function PUT(req: NextRequest, ctx: RouteCtx) {
  return handle(req, ctx);
}
