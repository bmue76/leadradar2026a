import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isSmtpConfigured, sendMail, smtpConfigStatus } from "@/lib/mailer";
import QRCode from "qrcode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  email: z.string().email(),
});

function traceId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function jsonOk(data: unknown, tid: string): Response {
  return NextResponse.json({ ok: true, data, traceId: tid }, { status: 200, headers: { "x-trace-id": tid } });
}

function jsonError(code: string, message: string, tid: string, status = 400, details?: unknown): Response {
  return NextResponse.json({ ok: false, error: { code, message, details }, traceId: tid }, { status, headers: { "x-trace-id": tid } });
}

async function validateBody(req: NextRequest, tid: string) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return { ok: false as const, res: jsonError("BAD_JSON", "Invalid JSON body.", tid, 400) };
  }
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return { ok: false as const, res: jsonError("VALIDATION_ERROR", parsed.error.message, tid, 400) };
  return { ok: true as const, data: parsed.data };
}

function requireTenant(
  req: NextRequest,
  tid: string
): { ok: true; tenantId: string; tenantSlug: string } | { ok: false; res: Response } {
  const tenantId = req.headers.get("x-tenant-id") || "";
  const tenantSlug = req.headers.get("x-tenant-slug") || "";

  if (!tenantId) return { ok: false, res: jsonError("TENANT_CONTEXT_REQUIRED", "Missing x-tenant-id.", tid, 401) };
  if (!tenantSlug) return { ok: false, res: jsonError("TENANT_CONTEXT_REQUIRED", "Missing x-tenant-slug.", tid, 401) };

  return { ok: true, tenantId, tenantSlug };
}

function qrPayload(tenantSlug: string, code: string): string {
  return `leadradar://provision?tenant=${encodeURIComponent(tenantSlug)}&code=${encodeURIComponent(code)}`;
}

type QRCodeToBuffer = {
  toBuffer: (
    text: string,
    opts?: { type?: "png"; width?: number; margin?: number; errorCorrectionLevel?: "L" | "M" | "Q" | "H" }
  ) => Promise<Buffer>;
};

function buildHtml(opts: {
  deviceName: string;
  tenantSlug: string;
  code: string;
  expiresIso: string;
  deepLink: string;
  copyUrl: string;
  hasInlineQr: boolean;
  qrCid: string;
}) {
  const mono = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
  const btnPrimary =
    "display:inline-block;padding:10px 14px;border-radius:14px;background:#0f172a;color:#ffffff;text-decoration:none;font-weight:700;font-size:13px;";
  const btnSecondary =
    "display:inline-block;padding:10px 14px;border-radius:14px;background:#ffffff;color:#0f172a;text-decoration:none;font-weight:700;font-size:13px;border:1px solid #e2e8f0;";

  const qrBlock = opts.hasInlineQr
    ? `<div style="margin-top:16px;padding:16px;border:1px solid #e2e8f0;border-radius:16px;background:#ffffff;">
         <div style="font-size:12px;color:#64748b;font-weight:700;margin-bottom:10px;">QR Code</div>
         <img src="cid:${opts.qrCid}" alt="QR Code" width="240" height="240" style="display:block;border-radius:12px;border:1px solid #e2e8f0;" />
         <div style="margin-top:10px;font-size:12px;color:#64748b;">Wenn Bilder blockiert sind: Token unten manuell eingeben.</div>
       </div>`
    : `<div style="margin-top:16px;padding:16px;border:1px solid #e2e8f0;border-radius:16px;background:#ffffff;color:#64748b;font-size:12px;">
         QR konnte nicht eingebettet werden. Bitte Token manuell eingeben.
       </div>`;

  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f8fafc;padding:24px;">
    <div style="max-width:640px;margin:0 auto;">
      <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:20px;overflow:hidden;">
        <div style="padding:20px 22px;border-bottom:1px solid #e2e8f0;">
          <div style="font-size:12px;color:#64748b;font-weight:700;letter-spacing:.04em;">LEADRADAR</div>
          <div style="margin-top:6px;font-size:18px;color:#0f172a;font-weight:700;">Gerät verbinden</div>
          <div style="margin-top:6px;font-size:13px;color:#475569;">Scanne den QR Code oder gib den Token in der App ein.</div>
        </div>

        <div style="padding:20px 22px;">
          <div style="display:flex;flex-wrap:wrap;gap:12px;">
            <div style="flex:1;min-width:220px;padding:14px 16px;border:1px solid #e2e8f0;border-radius:16px;background:#ffffff;">
              <div style="font-size:12px;color:#64748b;font-weight:700;">Gerät</div>
              <div style="margin-top:6px;font-size:15px;color:#0f172a;font-weight:700;">${opts.deviceName}</div>
              <div style="margin-top:8px;font-size:12px;color:#64748b;">Tenant: <span style="font-weight:700;color:#0f172a;">${opts.tenantSlug}</span></div>
            </div>

            <div style="flex:1;min-width:220px;padding:14px 16px;border:1px solid #e2e8f0;border-radius:16px;background:#ffffff;">
              <div style="font-size:12px;color:#64748b;font-weight:700;">Token</div>
              <div style="margin-top:6px;font-family:${mono};font-size:18px;color:#0f172a;font-weight:800;letter-spacing:.08em;">${opts.code}</div>
              <div style="margin-top:8px;font-size:12px;color:#64748b;">Gültig bis: <span style="font-weight:700;color:#0f172a;">${opts.expiresIso}</span></div>
            </div>
          </div>

          <div style="margin-top:14px;display:flex;flex-wrap:wrap;gap:10px;">
            <a href="${opts.copyUrl}" style="${btnPrimary}">Token kopieren</a>
            <a href="${opts.deepLink}" style="${btnSecondary}">App öffnen</a>
          </div>
          <div style="margin-top:8px;font-size:12px;color:#64748b;">„Token kopieren“ öffnet eine Seite mit Copy-Button (Browser).</div>

          ${qrBlock}

          <div style="margin-top:16px;padding:14px 16px;border:1px solid #e2e8f0;border-radius:16px;background:#f8fafc;">
            <div style="font-size:12px;color:#64748b;font-weight:700;">Deep Link (Fallback)</div>
            <div style="margin-top:6px;font-family:${mono};font-size:12px;color:#0f172a;word-break:break-all;">${opts.deepLink}</div>
          </div>

          <div style="margin-top:16px;font-size:12px;color:#64748b;">
            Tipp: Viele Mail-Programme blockieren Bilder. Falls du keinen QR siehst: Token manuell kopieren/abtippen oder „Token kopieren“ verwenden.
          </div>
        </div>
      </div>

      <div style="margin-top:10px;font-size:11px;color:#94a3b8;text-align:center;">LeadRadar · Gerät-Onboarding</div>
    </div>
  </div>`;
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<Response> {
  const tid = traceId();
  const tenant = requireTenant(req, tid);
  if (!tenant.ok) return tenant.res;

  const body = await validateBody(req, tid);
  if (!body.ok) return body.res;

  const { id: deviceId } = await ctx.params;

  const device = await prisma.mobileDevice.findFirst({
    where: { id: deviceId, tenantId: tenant.tenantId },
    select: { id: true, name: true },
  });
  if (!device) return jsonError("NOT_FOUND", "Device not found.", tid, 404);

  const now = new Date();
  const token = await prisma.mobileProvisionToken.findFirst({
    where: { tenantId: tenant.tenantId, deviceId, status: "ACTIVE", expiresAt: { gt: now } },
    orderBy: { createdAt: "desc" },
    select: { tokenPlaintext: true, expiresAt: true },
  });
  if (!token?.tokenPlaintext) {
    return jsonError("NO_ACTIVE_TOKEN", "No active provisioning token to resend. Create a new one.", tid, 409);
  }

  const code = token.tokenPlaintext;
  const deepLink = qrPayload(tenant.tenantSlug, code);
  const expiresIso = token.expiresAt.toISOString();

  const baseUrl = (process.env.APP_BASE_URL || "").trim() || req.nextUrl.origin;
  const copyUrl = `${baseUrl}/provision?tenant=${encodeURIComponent(tenant.tenantSlug)}&code=${encodeURIComponent(code)}`;

  const text =
    `LeadRadar – Gerät verbinden\n\n` +
    `Gerät: ${device.name}\nTenant: ${tenant.tenantSlug}\nToken: ${code}\nGültig bis: ${expiresIso}\n\n` +
    `Token kopieren (Browser):\n${copyUrl}\n\n` +
    `Deep Link:\n${deepLink}\n`;

  const smtp = smtpConfigStatus();

  if (!isSmtpConfigured()) {
    console.log("[tp7.8] provisioning resend", {
      to: body.data.email,
      deviceId,
      deviceName: device.name,
      expiresAt: expiresIso,
      code,
      qrPayload: deepLink,
      copyUrl,
      smtp,
    });

    return jsonOk(
      { sent: true, mode: "LOGGED_ONLY", to: body.data.email, deviceId, expiresAt: expiresIso, qrPayload: deepLink, copyUrl, smtp },
      tid
    );
  }

  const qrCid = "leadradar-qr";
  let qrPng: Buffer | null = null;

  try {
    const qr = QRCode as unknown as QRCodeToBuffer;
    qrPng = await qr.toBuffer(deepLink, { type: "png", width: 320, margin: 1, errorCorrectionLevel: "M" });
  } catch (e) {
    console.log("[tp7.8] QR generation failed", { err: e instanceof Error ? e.message : String(e) });
    qrPng = null;
  }

  const html = buildHtml({
    deviceName: device.name,
    tenantSlug: tenant.tenantSlug,
    code,
    expiresIso,
    deepLink,
    copyUrl,
    hasInlineQr: Boolean(qrPng),
    qrCid,
  });

  try {
    const info = await sendMail({
      to: body.data.email,
      subject: `LeadRadar: Gerät verbinden (${device.name})`,
      text,
      html,
      attachments: qrPng
        ? [{ filename: "leadradar-qr.png", content: qrPng, cid: qrCid, contentType: "image/png" }]
        : undefined,
    });

    return jsonOk({ sent: true, mode: info.mode, to: body.data.email, deviceId, expiresAt: expiresIso }, tid);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Email send failed.";
    return jsonError("EMAIL_SEND_FAILED", msg, tid, 502, { smtp });
  }
}
