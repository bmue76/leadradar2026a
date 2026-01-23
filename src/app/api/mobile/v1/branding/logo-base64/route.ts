import { readFile } from "node:fs/promises";

import { jsonError, jsonOk } from "@/lib/api";
import { isHttpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireMobileAuth } from "@/lib/mobileAuth";
import { enforceRateLimit } from "@/lib/rateLimit";
import { fileExists, getAbsolutePath } from "@/lib/storage";

export const runtime = "nodejs";

const BRANDING_ROOT_DIR = ".tmp_branding";

type LogoBase64Payload = {
  mime: string;
  base64: string;
};

export async function GET(req: Request) {
  try {
    const auth = await requireMobileAuth(req);

    enforceRateLimit(`mobile:${auth.apiKeyId}:branding_logo`, { limit: 30, windowMs: 60_000 });

    // Ops telemetry
    const now = new Date();
    await prisma.mobileApiKey.update({
      where: { id: auth.apiKeyId },
      data: { lastUsedAt: now },
    });
    await prisma.mobileDevice.update({
      where: { id: auth.deviceId },
      data: { lastSeenAt: now },
    });

    const t = await prisma.tenant.findUnique({
      where: { id: auth.tenantId },
      select: { logoKey: true, logoMime: true },
    });

    if (!t?.logoKey || !t.logoMime) {
      return jsonError(req, 404, "NOT_FOUND", "Logo not found.");
    }

    const absPath = getAbsolutePath({ rootDirName: BRANDING_ROOT_DIR, relativeKey: t.logoKey });
    const exists = await fileExists(absPath);
    if (!exists) return jsonError(req, 404, "NOT_FOUND", "Logo not found.");

    const buf = await readFile(absPath);
    const payload: LogoBase64Payload = { mime: t.logoMime, base64: buf.toString("base64") };

    return jsonOk(req, payload);
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
