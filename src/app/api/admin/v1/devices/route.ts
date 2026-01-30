import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api";
import { isHttpError, validateQuery } from "@/lib/http";
import { requireAdminAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type DeviceListStatus = "CONNECTED" | "STALE" | "NEVER";

function computeStatus(lastSeenAt: Date | null): DeviceListStatus {
  if (!lastSeenAt) return "NEVER";
  const now = Date.now();
  const diff = now - lastSeenAt.getTime();
  return diff <= 24 * 60 * 60 * 1000 ? "CONNECTED" : "STALE";
}

const QuerySchema = z.object({
  q: z.string().max(100).optional(),
  status: z.enum(["CONNECTED", "STALE", "NEVER"]).optional(),
  sort: z.enum(["LAST_SEEN_DESC", "LAST_SEEN_ASC", "NAME_ASC", "NAME_DESC"]).optional(),
});

export async function GET(req: Request) {
  try {
    const ctx = await requireAdminAuth(req);
    const q = await validateQuery(req, QuerySchema);

    const take = 200;

    const rows = await prisma.mobileDevice.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(q.q
          ? {
              OR: [
                { id: { contains: q.q, mode: "insensitive" } },
                { name: { contains: q.q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        status: true,
        lastSeenAt: true,
        createdAt: true,
        activeEventId: true,
        activeEvent: { select: { id: true, name: true, status: true } },
        apiKey: { select: { status: true, prefix: true, revokedAt: true } },
      },
      orderBy:
        q.sort === "NAME_ASC"
          ? { name: "asc" }
          : q.sort === "NAME_DESC"
          ? { name: "desc" }
          : q.sort === "LAST_SEEN_ASC"
          ? { lastSeenAt: "asc" }
          : { lastSeenAt: "desc" },
      take,
    });

    const items = rows
      .map((d) => {
        const status = computeStatus(d.lastSeenAt);
        return {
          id: d.id,
          name: d.name,
          status,
          lastSeenAt: d.lastSeenAt ? d.lastSeenAt.toISOString() : null,
          createdAt: d.createdAt.toISOString(),
          activeEvent: d.activeEvent
            ? { id: d.activeEvent.id, name: d.activeEvent.name, status: d.activeEvent.status }
            : null,
          apiKey: {
            prefix: d.apiKey.prefix,
            status: d.apiKey.status,
            revokedAt: d.apiKey.revokedAt ? d.apiKey.revokedAt.toISOString() : null,
          },
        };
      })
      .filter((it) => (q.status ? it.status === q.status : true));

    return jsonOk(req, { items });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
