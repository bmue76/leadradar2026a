import * as crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { requireMobileAuth } from "@/lib/mobileAuth";
import { jsonError } from "@/lib/api";
import { fileExists, getAbsolutePath, statFile, streamFileWeb } from "@/lib/storage";

export const runtime = "nodejs";

const BRANDING_ROOT_DIR = ".tmp_branding";

function etagFrom(sizeBytes: number, mtimeMs: number): string {
  return `W/"${sizeBytes}-${Math.floor(mtimeMs)}"`;
}

async function findLogo(tenantId: string): Promise<{ absPath: string; mime: string; etag: string } | null> {
  const t = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { logoKey: true, logoMime: true },
  });

  if (!t?.logoKey || !t.logoMime) return null;

  const absPath = getAbsolutePath({ rootDirName: BRANDING_ROOT_DIR, relativeKey: t.logoKey });
  const exists = await fileExists(absPath);
  if (!exists) return null;

  const st = await statFile(absPath);
  const etag = etagFrom(st.sizeBytes, st.mtimeMs);
  return { absPath, mime: t.logoMime, etag };
}

export async function GET(req: Request): Promise<Response> {
  try {
    const auth = await requireMobileAuth(req);

    const found = await findLogo(auth.tenantId);
    if (!found) return jsonError(req, 404, "NOT_FOUND", "Logo not found.");

    const ifNoneMatch = req.headers.get("if-none-match");
    if (ifNoneMatch && ifNoneMatch === found.etag) {
      return new Response(null, {
        status: 304,
        headers: {
          "x-trace-id": crypto.randomUUID(),
          "Cache-Control": "private, max-age=3600",
          ETag: found.etag,
        },
      });
    }

    const body = streamFileWeb(found.absPath);

    return new Response(body, {
      status: 200,
      headers: {
        "x-trace-id": crypto.randomUUID(),
        "Content-Type": found.mime,
        "Cache-Control": "private, max-age=3600",
        ETag: found.etag,
      },
    });
  } catch {
    return jsonError(req, 401, "UNAUTHORIZED", "Not authenticated.");
  }
}
