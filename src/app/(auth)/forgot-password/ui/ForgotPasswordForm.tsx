"use client";

import * as React from "react";
import styles from "../../_components/AuthForm.module.css";

export default function ForgotPasswordForm() {
  const [email, setEmail] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [done, setDone] = React.useState<string | null>(null);
  const [debugUrl, setDebugUrl] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setDone(null);
    setDebugUrl(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/password/forgot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const json = await res.json();
      setDone(json?.data?.message || "Wenn das Konto existiert, wurde eine E-Mail versendet.");
      setDebugUrl(json?.data?.debugResetUrl || null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={onSubmit}>
      {done ? <div className={styles.success}>{done}</div> : null}
      {debugUrl ? (
        <div className={styles.success}>
          DEV Link (nur lokal): <a href={debugUrl}>{debugUrl}</a>
        </div>
      ) : null}

      <div className={styles.field}>
        <div className={styles.labelRow}>
          <div className={styles.label}>E-Mail</div>
        </div>
        <input
          className={styles.input}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@firma.ch"
          inputMode="email"
          autoComplete="email"
        />
      </div>

      <button className={styles.button} type="submit" disabled={loading}>
        {loading ? "Senden…" : "Link senden"}
      </button>

      <div className={styles.links}>
        <a className={styles.link} href="/auth/login">Zurück</a>
        <span />
      </div>
    </form>
  );
}
