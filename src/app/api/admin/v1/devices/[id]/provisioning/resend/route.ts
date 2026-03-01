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
  return NextResponse.json(
    { ok: false, error: { code, message, details }, traceId: tid },
    { status, headers: { "x-trace-id": tid } }
  );
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

function formatZurich(dt: Date): string {
  try {
    return new Intl.DateTimeFormat("de-CH", {
      timeZone: "Europe/Zurich",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(dt);
  } catch {
    return dt.toISOString();
  }
}

function buildHtml(opts: {
  deviceName: string;
  tenantSlug: string;
  code: string;
  expiresLabel: string;
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

  const card = "border:1px solid #e2e8f0;border-radius:18px;background:#ffffff;";
  const label = "font-size:12px;color:#64748b;font-weight:700;letter-spacing:.02em;";
  const text = "font-size:13px;color:#475569;line-height:1.45;";
  const title = "font-size:18px;color:#0f172a;font-weight:800;letter-spacing:-.01em;";

  const qrBlock = opts.hasInlineQr
    ? `<div style="${card}padding:16px;">
         <div style="${label}margin-bottom:10px;">Option A: QR-Code scannen</div>
         <img src="cid:${opts.qrCid}" alt="QR Code" width="240" height="240" style="display:block;border-radius:14px;border:1px solid #e2e8f0;" />
         <div style="${text}margin-top:10px;color:#64748b;">Wenn Bilder blockiert sind: Option B (Code einfügen) verwenden.</div>
       </div>`
    : `<div style="${card}padding:16px;">
         <div style="${label}margin-bottom:6px;">Option A: QR-Code scannen</div>
         <div style="${text}color:#64748b;">QR konnte nicht eingebettet werden. Bitte Option B (Code einfügen) verwenden.</div>
       </div>`;

  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f8fafc;padding:24px;">
    <div style="max-width:680px;margin:0 auto;">
      <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:22px;overflow:hidden;box-shadow:0 1px 0 rgba(15,23,42,.04);">
        <div style="padding:20px 22px;border-bottom:1px solid #e2e8f0;">
          <div style="font-size:12px;color:#64748b;font-weight:800;letter-spacing:.08em;">LEADRADAR</div>
          <div style="margin-top:8px;${title}">Gerät aktivieren</div>
          <div style="margin-top:8px;${text}">
            Scanne den QR-Code oder füge den Aktivierungscode in der App ein.
          </div>
        </div>

        <div style="padding:20px 22px;">
          <div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:14px;">
            <div style="flex:1;min-width:240px;${card}padding:14px 16px;">
              <div style="${label}">Gerät</div>
              <div style="margin-top:6px;font-size:15px;color:#0f172a;font-weight:800;">${opts.deviceName}</div>
              <div style="margin-top:8px;font-size:12px;color:#64748b;">Tenant: <span style="font-weight:800;color:#0f172a;">${opts.tenantSlug}</span></div>
            </div>

            <div style="flex:1;min-width:240px;${card}padding:14px 16px;">
              <div style="${label}">Gültigkeit</div>
              <div style="margin-top:6px;font-size:15px;color:#0f172a;font-weight:800;">bis ${opts.expiresLabel}</div>
              <div style="margin-top:6px;font-size:12px;color:#94a3b8;">(${opts.expiresIso})</div>
            </div>
          </div>

          <div style="display:flex;flex-wrap:wrap;gap:12px;">
            ${qrBlock}

            <div style="${card}padding:16px;flex:1;min-width:260px;">
              <div style="${label}margin-bottom:10px;">Option B: Code einfügen</div>

              <div style="padding:12px 12px;border-radius:14px;background:#f8fafc;border:1px solid #e2e8f0;">
                <div style="font-size:12px;color:#64748b;font-weight:800;margin-bottom:6px;">Aktivierungscode</div>
                <div style="font-family:${mono};font-size:20px;color:#0f172a;font-weight:900;letter-spacing:.10em;">${opts.code}</div>
              </div>

              <div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:10px;">
                <a href="${opts.copyUrl}" style="${btnPrimary}">Code kopieren</a>
                <a href="${opts.deepLink}" style="${btnSecondary}">App öffnen</a>
              </div>

              <div style="${text}margin-top:10px;color:#64748b;">
                In der App: <b>Gerät aktivieren</b> → Code einfügen → <b>Aktivieren</b>.
              </div>
            </div>
          </div>

          <div style="margin-top:14px;${card}padding:14px 16px;background:#f8fafc;">
            <div style="${label}">Deep Link (Fallback)</div>
            <div style="margin-top:8px;font-family:${mono};font-size:12px;color:#0f172a;word-break:break-all;">${opts.deepLink}</div>
          </div>

          <div style="margin-top:14px;font-size:12px;color:#64748b;">
            Tipp: Viele Mail-Programme blockieren Bilder. Falls du keinen QR siehst, verwende Option B und füge den Code manuell ein.
          </div>
        </div>
      </div>

      <div style="margin-top:10px;font-size:11px;color:#94a3b8;text-align:center;">
        Diese E-Mail wurde automatisch gesendet (no-reply). LeadRadar · Gerät-Onboarding
      </div>
    </div>
  </div>`;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
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
  const expiresLabel = formatZurich(token.expiresAt);

  const baseUrl = (process.env.APP_BASE_URL || "").trim() || req.nextUrl.origin;
  const copyUrl = `${baseUrl}/provision?tenant=${encodeURIComponent(tenant.tenantSlug)}&code=${encodeURIComponent(code)}`;

  const text =
    `LeadRadar – Gerät aktivieren\n\n` +
    `Gerät: ${device.name}\n` +
    `Tenant: ${tenant.tenantSlug}\n` +
    `Aktivierungscode: ${code}\n` +
    `Gültig bis: ${expiresLabel}\n\n` +
    `Code kopieren (Browser):\n${copyUrl}\n\n` +
    `Deep Link (Fallback):\n${deepLink}\n\n` +
    `In der App: „Gerät aktivieren“ → Code einfügen → „Aktivieren“.\n`;

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
      {
        sent: true,
        mode: "LOGGED_ONLY",
        to: body.data.email,
        deviceId,
        expiresAt: expiresIso,
        qrPayload: deepLink,
        copyUrl,
        smtp,
      },
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
    expiresLabel,
    expiresIso,
    deepLink,
    copyUrl,
    hasInlineQr: Boolean(qrPng),
    qrCid,
  });

  try {
    const info = await sendMail({
      to: body.data.email,
      subject: `LeadRadar: Gerät aktivieren (${device.name})`,
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
