import nodemailer from "nodemailer";

export type MailAttachment = {
  filename: string;
  content: Buffer | Uint8Array | string;
  contentType?: string;
};

export type SendArgs = {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: MailAttachment[];
};

function hasSmtp(): boolean {
  return Boolean(process.env.SMTP_HOST);
}

export async function sendMail(args: SendArgs): Promise<{ delivered: boolean; mode: "smtp" | "log" }> {
  const prod = process.env.NODE_ENV === "production";

  if (!hasSmtp()) {
    // GoLive: in PROD ist SMTP Pflicht
    if (prod) throw new Error("SMTP_NOT_CONFIGURED");

    // DEV fallback: log email instead of sending
    console.log("[MAIL:LOG]", {
      to: args.to,
      subject: args.subject,
      text: args.text,
      attachments:
        args.attachments?.map((a) => ({ filename: a.filename, contentType: a.contentType ?? null })) ?? [],
    });
    return { delivered: true, mode: "log" };
  }

  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;
  const secure = process.env.SMTP_SECURE === "true";

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" } : undefined,
  });

  const from = process.env.MAIL_FROM ?? "LeadRadar <no-reply@leadradar.ch>";

  await transporter.sendMail({
    from,
    to: args.to,
    subject: args.subject,
    html: args.html,
    text: args.text,
    attachments: args.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
    })),
  });

  return { delivered: true, mode: "smtp" };
}
