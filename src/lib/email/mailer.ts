import nodemailer from "nodemailer";

type SendArgs = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

function hasSmtp(): boolean {
  return Boolean(process.env.SMTP_HOST);
}

export async function sendMail(args: SendArgs): Promise<{ delivered: boolean; mode: "smtp" | "log" }> {
  if (!hasSmtp()) {
    // Dev/MVP fallback: log email instead of sending
    console.log("[MAIL:LOG]", { to: args.to, subject: args.subject, text: args.text });
    return { delivered: true, mode: "log" };
  }

  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;
  const secure = process.env.SMTP_SECURE === "true";

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" }
      : undefined,
  });

  const from = process.env.MAIL_FROM ?? "LeadRadar <no-reply@leadradar.ch>";

  await transporter.sendMail({
    from,
    to: args.to,
    subject: args.subject,
    html: args.html,
    text: args.text,
  });

  return { delivered: true, mode: "smtp" };
}
