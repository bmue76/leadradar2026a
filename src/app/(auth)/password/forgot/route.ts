import { z } from "zod";
import { createHmac, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/api";
import { isHttpError, validateBody } from "@/lib/http";

export const runtime = "nodejs";

const ForgotSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
});

function mustGetSessionSecret(): string {
  const s = (process.env.AUTH_SESSION_SECRET || "").trim();
  if (s.length < 32) throw new Error("AUTH_SESSION_SECRET missing or too short.");
  return s;
}

function hashResetToken(token: string): string {
  const secret = mustGetSessionSecret();
  return createHmac("sha256", secret).update(`pwreset:${token}`).digest("hex");
}

function ttlMinutes(): number {
  const raw = (process.env.AUTH_PASSWORD_RESET_TTL_MINUTES || "60").trim();
  const n = Number(raw);
  return Number.isFinite(n) && n >= 10 && n <= 24 * 60 ? n : 60;
}

export async function POST(req: Request) {
  try {
    const body = await validateBody(req, ForgotSchema);

    // leak-safe: always respond ok, even if user not found
    const user = await prisma.user.findUnique({
      where: { email: body.email },
      select: { id: true },
    });

    let resetUrl: string | undefined;

    if (user) {
      const token = randomBytes(32).toString("base64url");
      const tokenHash = hashResetToken(token);

      const expiresAt = new Date(Date.now() + ttlMinutes() * 60 * 1000);

      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
        },
        select: { id: true },
      });

      // DEV behaviour: show link in UI
      if (process.env.NODE_ENV !== "production") {
        resetUrl = `/reset-password?token=${encodeURIComponent(token)}`;
      }
    }

    return jsonOk(req, { resetUrl });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL_ERROR", "Unexpected error.");
  }
}
