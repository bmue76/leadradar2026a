import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import dotenv from "dotenv";
import nodemailer from "nodemailer";

function loadEnv() {
  const cwd = process.cwd();
  const envLocal = path.join(cwd, ".env.local");
  const env = path.join(cwd, ".env");

  if (fs.existsSync(envLocal)) dotenv.config({ path: envLocal });
  if (fs.existsSync(env)) dotenv.config({ path: env });

  const req = [
    "EMAIL_SERVER_HOST",
    "EMAIL_SERVER_PORT",
    "EMAIL_SERVER_SECURE",
    "EMAIL_SERVER_USER",
    "EMAIL_SERVER_PASSWORD",
    "EMAIL_FROM",
  ];
  for (const k of req) {
    if (!process.env[k]) {
      console.error(`Missing env: ${k}`);
      process.exit(1);
    }
  }
}

function envBool(k, defVal) {
  const v = process.env[k];
  if (v == null) return defVal;
  return ["1", "true", "yes", "on"].includes(String(v).toLowerCase());
}

function mustNumber(k) {
  const n = Number(process.env[k]);
  if (!Number.isFinite(n)) {
    console.error(`Invalid number for ${k}`);
    process.exit(1);
  }
  return n;
}

async function main() {
  loadEnv();

  const host = process.env.EMAIL_SERVER_HOST;
  const port = mustNumber("EMAIL_SERVER_PORT");
  const secure = envBool("EMAIL_SERVER_SECURE", true);
  const user = process.env.EMAIL_SERVER_USER;
  const pass = process.env.EMAIL_SERVER_PASSWORD;
  const from = process.env.EMAIL_FROM;

  const to = process.env.SMTP_TEST_TO || "beat.mueller@atlex.ch";

  console.log("SMTP test config:");
  console.log({ host, port, secure, user, from, to });
  console.log("");

  const transporter = nodemailer.createTransport(
    {
      host,
      port,
      secure,
      auth: { user, pass },
      logger: true,
      debug: true,
    },
    { from }
  );

  console.log("1) verify() …");
  await transporter.verify();
  console.log("   OK ✅\n");

  console.log("2) sendMail() …");
  const info = await transporter.sendMail({
    to,
    subject: "LeadRadar DEV SMTP Test",
    text: "Wenn du das liest: SMTP Versand funktioniert.",
  });

  console.log("   sent ✅");
  console.log({ messageId: info.messageId, response: info.response });
}

main().catch((e) => {
  console.error("\nFAILED ❌");
  console.error(e && e.message ? e.message : e);
  process.exit(1);
});
