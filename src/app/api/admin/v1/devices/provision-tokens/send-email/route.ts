import QRCode from "qrcode";
import crypto from "crypto";
import { z } from "zod";

import { jsonError, jsonOk } from "@/lib/api";
import { isHttpError, validateBody } from "@/lib/http";
import { requireAdminAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/email/mailer";

export const runtime = "nodejs";

const BodySchema = z.object({
  email: z.string().email().max(200),
  expiresInMinutes: z.number().int().min(5).max(120).optional(),
  message: z.string().max(800).optional(),
});

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

function randomToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

async function getDeviceLimitSnapshot(tenantId: string) {
  const ent = await prisma.tenantEntitlement.upsert({
    where: { tenantId },
    create: { tenantId, validUntil: null, maxDevices: 1 },
    update: {},
    select: { maxDevices: true },
  });

  const activeDevices = await prisma.mobileDevice.count({
    where: { tenantId, status: "ACTIVE", apiKey: { status: "ACTIVE" } },
  });

  return { maxDevices: ent.maxDevices, activeDevices };
}

function escapeHtml(s: string): string {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function renderEmailHtml(args: { token: string; expiresAtIso: string; message?: string }) {
  const { token, expiresAtIso, message } = args;
  const safeMsg = message ? escapeHtml(message) : "";

  return `
  <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height: 1.5; color: #0f172a;">
    <h2 style="margin: 0 0 8px;">LeadRadar — Gerät verbinden</h2>
    <p style="margin: 0 0 14px; color: #334155;">
      Scanne den QR-Code in der App (oder gib den Code manuell ein).
    </p>
    ${safeMsg ? `<p style="margin: 0 0 14px; padding: 10px 12px; background:#f1f5f9; border-radius:12px;"><strong>Nachricht:</strong><br/>${safeMsg}</p>` : ""}
    <p style="margin: 0 0 10px;"><strong>Token:</strong><br/>
      <span style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono; font-size: 14px;">${token}</span>
    </p>
    <p style="margin: 0 0 14px; color:#334155;">Ablauf: <strong>${expiresAtIso}</strong></p>
    <p style="margin: 0; color:#64748b; font-size: 12px;">Tipp: Der QR-Code enthält nur den Token (ideal fürs In-App Scanning).</p>
  </div>
  `;
}

function renderEmailText(args: { token: string; expiresAtIso: string; message?: string }) {
  const { token, expiresAtIso, message } = args;
  const lines = [
    "LeadRadar — Gerät verbinden",
    "",
    message ? `Nachricht:\n${message}\n` : "",
    `Token: ${token}`,
    `Ablauf: ${expiresAtIso}`,
    "",
    "Scanne den QR-Code in der App oder gib den Token manuell ein.",
  ];
  return lines.filter(Boolean).join("\n");
}

export async function POST(req: Request) {
  try {
    const ctx = await requireAdminAuth(req);
    const body = await validateBody(req, BodySchema, 64 * 1024);

    const { maxDevices, activeDevices } = await getDeviceLimitSnapshot(ctx.tenantId);
    if (activeDevices >= maxDevices) {
      return jsonError(req, 402, "DEVICE_LIMIT_REACHED", "Maximale Anzahl Geräte erreicht.", {
        activeDevices,
        maxDevices,
      });
    }

    const minutes = body.expiresInMinutes ?? 30;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + minutes * 60_000);

    const token = randomToken();
    const tokenHash = sha256Hex(token);
    const prefix = token.slice(0, 6);

    await prisma.mobileProvisionToken.create({
      data: {
        tenantId: ctx.tenantId,
        prefix,
        tokenHash,
        status: "ACTIVE",
        expiresAt,
        createdByUserId: ctx.userId ?? null,
      },
      select: { id: true },
    });

    const qrPngDataUrl = await QRCode.toDataURL(token, { errorCorrectionLevel: "M", margin: 2, scale: 6 });

    const subject = "LeadRadar — Gerät verbinden";
    const html =
      renderEmailHtml({ token, expiresAtIso: expiresAt.toISOString(), message: body.message }) +
      `<div style="margin-top:12px;"><img alt="QR" src="${qrPngDataUrl}" width="180" height="180" style="border-radius:12px;border:1px solid #e2e8f0;"/></div>`;

    const text = renderEmailText({ token, expiresAtIso: expiresAt.toISOString(), message: body.message });

    await sendMail({
      to: body.email,
      subject,
      html,
      text,
    });

    return jsonOk(req, { sent: true, email: body.email, expiresAt: expiresAt.toISOString() });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
