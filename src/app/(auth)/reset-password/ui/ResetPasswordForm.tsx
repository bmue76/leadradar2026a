"use client";

import * as React from "react";
import styles from "../../_components/AuthForm.module.css";

export default function ResetPasswordForm({ token }: { token: string }) {
  const [pw1, setPw1] = React.useState("");
  const [pw2, setPw2] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(null);

    if (!token) {
      setError("Token fehlt.");
      return;
    }
    if (pw1.length < 8) {
      setError("Passwort muss mindestens 8 Zeichen haben.");
      return;
    }
    if (pw1 !== pw2) {
      setError("Passwörter stimmen nicht überein.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/password/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, newPassword: pw1 }),
      });

      const json = await res.json();
      if (!res.ok || !json?.ok) {
        setError(json?.error?.message || "Zurücksetzen fehlgeschlagen.");
        return;
      }

      setDone("Passwort aktualisiert. Du kannst dich jetzt anmelden.");
    } catch {
      setError("Zurücksetzen fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={onSubmit}>
      {error ? <div className={styles.error}>{error}</div> : null}
      {done ? <div className={styles.success}>{done}</div> : null}

      <div className={styles.field}>
        <div className={styles.labelRow}>
          <div className={styles.label}>Neues Passwort</div>
        </div>
        <input
          className={styles.input}
          value={pw1}
          onChange={(e) => setPw1(e.target.value)}
          type="password"
          autoComplete="new-password"
        />
      </div>

      <div className={styles.field}>
        <div className={styles.labelRow}>
          <div className={styles.label}>Passwort bestätigen</div>
        </div>
        <input
          className={styles.input}
          value={pw2}
          onChange={(e) => setPw2(e.target.value)}
          type="password"
          autoComplete="new-password"
        />
      </div>

      <button className={styles.button} type="submit" disabled={loading}>
        {loading ? "Speichern…" : "Speichern"}
      </button>

      <div className={styles.links}>
        <a className={styles.link} href="/auth/login">Zum Login</a>
        <span />
      </div>
    </form>
  );
}
