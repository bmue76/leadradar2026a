"use client";

import React, { useMemo, useState } from "react";
import { signIn } from "next-auth/react";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const canSubmit = useMemo(() => {
    const e = email.trim().toLowerCase();
    return e.length >= 6 && e.includes("@") && e.includes(".");
  }, [email]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || busy) return;

    setBusy(true);
    try {
      await signIn("nodemailer", {
        email: email.trim().toLowerCase(),
        callbackUrl: "/admin",
        redirect: true,
      });
      setSent(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 440, margin: "48px auto", padding: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 650, marginBottom: 10 }}>LeadRadar Login</h1>
      <p style={{ opacity: 0.8, marginBottom: 18 }}>
        Passwortlos per Magic Link. E-Mail eingeben → Link öffnen → fertig.
      </p>

      <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <label style={{ fontSize: 13, opacity: 0.9 }}>E-Mail</label>
        <input
          value={email}
          onChange={(ev) => setEmail(ev.target.value)}
          placeholder="you@domain.tld"
          inputMode="email"
          autoComplete="email"
          style={{
            height: 44,
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,0.14)",
            padding: "0 12px",
            fontSize: 14,
            outline: "none",
          }}
        />

        <button
          type="submit"
          disabled={!canSubmit || busy}
          style={{
            height: 44,
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,0.14)",
            background: "rgba(0,0,0,0.04)",
            fontWeight: 650,
            cursor: !canSubmit || busy ? "not-allowed" : "pointer",
          }}
        >
          {busy ? "Sende Link…" : "Magic Link senden"}
        </button>

        {sent ? (
          <div style={{ marginTop: 6, padding: 12, borderRadius: 12, background: "rgba(0,0,0,0.04)" }}>
            <b>Mail ist unterwegs.</b> Öffne den Link (am Handy oder PC) – du landest direkt im Admin.
          </div>
        ) : null}
      </form>
    </main>
  );
}
