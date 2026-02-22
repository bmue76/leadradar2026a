import nodemailer from "nodemailer";

type TransporterT = ReturnType<typeof nodemailer.createTransport>;

type AttachmentInput = {
  filename: string;
  content: Buffer;
  cid?: string;
  contentType?: string;
};

type MailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: AttachmentInput[];
};

function env(name: string): string {
  return (process.env[name] || "").trim();
}

function fromAddress(): string {
  return env("SMTP_FROM") || env("MAIL_FROM") || env("EMAIL_FROM") || env("EMAIL_FROM_ADDRESS");
}

function boolEnv(name: string): boolean | null {
  const v = env(name);
  if (!v) return null;
  if (v === "1" || v.toLowerCase() === "true") return true;
  if (v === "0" || v.toLowerCase() === "false") return false;
  return null;
}

export function smtpConfigStatus(): { configured: boolean; missing: string[]; from: string | null } {
  const missing: string[] = [];
  if (!env("SMTP_HOST")) missing.push("SMTP_HOST");
  if (!env("SMTP_PORT")) missing.push("SMTP_PORT");
  const from = fromAddress();
  if (!from) missing.push("MAIL_FROM (or SMTP_FROM or EMAIL_FROM)");
  return { configured: missing.length === 0, missing, from: from || null };
}

export function isSmtpConfigured(): boolean {
  return smtpConfigStatus().configured;
}

let cachedTransporter: TransporterT | null = null;

function getTransporter(): TransporterT {
  if (cachedTransporter) return cachedTransporter;

  const host = env("SMTP_HOST");
  const portStr = env("SMTP_PORT");
  const user = env("SMTP_USER");
  const pass = env("SMTP_PASS");

  if (!host || !portStr) throw new Error("SMTP not configured (SMTP_HOST/SMTP_PORT).");

  const port = Number(portStr);
  if (!Number.isFinite(port)) throw new Error("SMTP_PORT must be a number.");

  const secureFromEnv = boolEnv("SMTP_SECURE");
  const secure = secureFromEnv ?? port === 465;

  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
  });

  return cachedTransporter;
}

export async function sendMail(input: MailInput): Promise<{ mode: "SMTP"; messageId: string }> {
  const from = fromAddress();
  if (!from) throw new Error("Missing from address (SMTP_FROM or MAIL_FROM or EMAIL_FROM).");

  const transporter = getTransporter();

  const info = await transporter.sendMail({
    from,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
    attachments: input.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
      cid: a.cid,
      contentType: a.contentType,
    })),
  });

  const msg = (info as unknown as { messageId?: unknown }).messageId;
  const messageId = typeof msg === "string" ? msg : "";
  return { mode: "SMTP", messageId };
}

/**
 * Backward-compatible helper for existing auth routes.
 */
export async function sendEmailVerification(
  ...args: unknown[]
): Promise<{ sent: true; mode: "SMTP" | "LOGGED_ONLY"; to: string; verifyUrl: string; messageId?: string }> {
  let to = "";
  let verifyUrl = "";
  let subject = "LeadRadar: E-Mail bestätigen";

  if (args.length === 1 && args[0] && typeof args[0] === "object") {
    const o = args[0] as Record<string, unknown>;
    const t = (o.to ?? o.email) as unknown;
    const u = (o.verifyUrl ?? o.url ?? o.link) as unknown;
    const s = o.subject as unknown;

    if (typeof t === "string") to = t.trim();
    if (typeof u === "string") verifyUrl = u.trim();
    if (typeof s === "string" && s.trim()) subject = s.trim();
  } else if (args.length >= 2 && typeof args[0] === "string" && typeof args[1] === "string") {
    to = args[0].trim();
    verifyUrl = args[1].trim();
    if (typeof args[2] === "string" && args[2].trim()) subject = args[2].trim();
  }

  if (!to || !verifyUrl) {
    console.log("[mailer] sendEmailVerification skipped (missing to/verifyUrl)", { to, verifyUrl });
    return { sent: true, mode: "LOGGED_ONLY", to: to || "unknown", verifyUrl: verifyUrl || "unknown" };
  }

  const text =
    `Bitte bestätige deine E-Mail-Adresse:\n\n` +
    `${verifyUrl}\n\n` +
    `Falls du das nicht angefordert hast, kannst du diese E-Mail ignorieren.\n`;

  const html =
    `<p>Bitte bestätige deine E-Mail-Adresse:</p>` +
    `<p><a href="${verifyUrl}">${verifyUrl}</a></p>` +
    `<p style="color:#64748b">Falls du das nicht angefordert hast, kannst du diese E-Mail ignorieren.</p>`;

  if (!isSmtpConfigured()) {
    console.log("[mailer] email verification (LOGGED_ONLY)", { to, verifyUrl, smtp: smtpConfigStatus() });
    return { sent: true, mode: "LOGGED_ONLY", to, verifyUrl };
  }

  const info = await sendMail({ to, subject, text, html });
  return { sent: true, mode: "SMTP", to, verifyUrl, messageId: info.messageId };
}
