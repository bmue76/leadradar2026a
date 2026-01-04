export async function sendEmailVerification(to: string, verifyUrl: string) {
  // TODO: später SMTP/Resend/Postmark integrieren
  console.log("[MAIL][verify]", { to, verifyUrl });
}
