export function provisioningEmailDeCH(args: {
  token: string;
  claimUrl: string;
  expiresAtIso: string;
  message?: string | null;
}) {
  const extra = args.message?.trim()
    ? `<p style="margin:12px 0; white-space:pre-wrap">${escapeHtml(args.message.trim())}</p>`
    : "";

  const html = `
  <div style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; line-height:1.4; color:#111;">
    <h2 style="margin:0 0 12px 0;">LeadRadar — Gerät verbinden</h2>
    <p style="margin:0 0 12px 0;">Hier sind deine Verbindungsdaten für ein neues Gerät.</p>
    ${extra}
    <p style="margin:0 0 8px 0;"><strong>Token:</strong> <span style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace;">${escapeHtml(args.token)}</span></p>
    <p style="margin:0 0 8px 0;"><strong>Gültig bis:</strong> ${escapeHtml(args.expiresAtIso)}</p>
    <p style="margin:0 0 12px 0;"><strong>Link:</strong> <a href="${escapeHtml(args.claimUrl)}">${escapeHtml(args.claimUrl)}</a></p>
    <p style="margin:0 0 12px 0;">Du kannst den Link direkt öffnen oder das Token in der App eingeben.</p>
    <p style="color:#666; margin:16px 0 0 0; font-size:12px;">Wenn du diese E-Mail nicht erwartet hast, kannst du sie ignorieren.</p>
  </div>
  `.trim();

  const text = [
    "LeadRadar — Gerät verbinden",
    "",
    args.message?.trim() ? args.message.trim() : "",
    "",
    `Token: ${args.token}`,
    `Gültig bis: ${args.expiresAtIso}`,
    `Link: ${args.claimUrl}`,
    "",
    "Du kannst den Link direkt öffnen oder das Token in der App eingeben.",
  ]
    .filter(Boolean)
    .join("\n");

  return { subject: "LeadRadar — Gerät verbinden", html, text };
}

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
