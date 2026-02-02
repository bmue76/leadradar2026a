import type { Prisma } from "@prisma/client";

import { jsonError } from "@/lib/api";
import { isHttpError } from "@/lib/http";
import { requireAdminAuth } from "@/lib/auth";

import { getExportJobById } from "../../_repo";
import { existsExportFile, readExportFile } from "../../_storage";

export const runtime = "nodejs";

function safeFileName(name: string): string {
  const cleaned = name.replace(/[^\w.\-() ]+/g, "_");
  return cleaned.length ? cleaned : "export.csv";
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function getFileNameFromParams(params: Prisma.JsonValue | null): string | undefined {
  if (!isRecord(params)) return undefined;
  const v = params.fileName;
  return typeof v === "string" ? v : undefined;
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdminAuth(req);
    const tenantId = auth.tenantId;

    const { id } = await ctx.params;

    const job = await getExportJobById(tenantId, id);
    if (!job) return jsonError(req, 404, "NOT_FOUND", "Export not found.");

    if (job.status !== "DONE") {
      return jsonError(req, 409, "NOT_READY", "Export ist noch nicht fertig.");
    }

    if (!job.resultStorageKey) return jsonError(req, 404, "NO_FILE", "Keine Export-Datei gefunden.");

    const ok = await existsExportFile(job.resultStorageKey);
    if (!ok) return jsonError(req, 404, "NO_FILE", "Keine Export-Datei gefunden.");

    const buf = await readExportFile(job.resultStorageKey);

    // TS-safe BodyInit: return as string (CSV is UTF-8)
    const body = buf.toString("utf8");

    const fileName = safeFileName(getFileNameFromParams(job.params ?? null) ?? "export.csv");

    return new Response(body, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${fileName}"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
