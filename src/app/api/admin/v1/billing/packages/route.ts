import { jsonError, jsonOk } from "@/lib/api";
import { requireAdminAuth } from "@/lib/auth";
import { isHttpError } from "@/lib/http";
import { prisma } from "@/lib/dbAdapter";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    await requireAdminAuth(req);

    const items = await prisma.billingSku.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        active: true,
        name: true,
        description: true,
        stripePriceId: true,
        currency: true,
        amountCents: true,
        grantLicense30d: true,
        grantLicense365d: true,
        grantDeviceSlots: true,
        creditExpiresInDays: true,
        sortOrder: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return jsonOk(req, { items });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
