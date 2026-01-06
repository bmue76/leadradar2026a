"use client";

import * as React from "react";
import styles from "./LoginForm.module.css";

type Props = {
  next: string;
  verified: "1" | "0" | null;
};

type ApiOk = { ok: true; data?: { redirectTo?: string } };
type ApiErr = { ok: false; error?: { message?: string } };

export default function LoginForm({ next, verified }: Props) {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const banner =
    verified === "1"
      ? "E-Mail bestätigt. Du kannst dich jetzt anmelden."
      : verified === "0"
        ? "Bitte bestätige zuerst deine E-Mail."
        : null;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;

    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ email, password, next }),
      });

      const json = (await res.json().catch(() => null)) as (ApiOk | ApiErr | null);

      if (!res.ok || !json || (json as ApiErr).ok === false) {
        const msg =
          (json as ApiErr | null)?.error?.message ||
          "Login fehlgeschlagen. Bitte prüfe E-Mail/Passwort.";
        setError(msg);
        setBusy(false);
        return;
      }

      const redirectTo = (json as ApiOk).data?.redirectTo || next || "/admin";
      window.location.assign(redirectTo);
    } catch {
      setError("Login fehlgeschlagen. Bitte versuche es erneut.");
      setBusy(false);
    }
  };

  return (
    <div className={styles.wrap}>
      {banner ? <div className={styles.banner}>{banner}</div> : null}
      {error ? <div className={styles.error}>{error}</div> : null}

      <form onSubmit={onSubmit} className={styles.form}>
        <label className={styles.label}>
          <span className={styles.labelText}>E-Mail</span>
          <input
            className={styles.input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="email"
            placeholder="name@firma.ch"
            required
          />
        </label>

        <label className={styles.label}>
          <span className={styles.labelText}>Passwort</span>
          <input
            className={styles.input}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="current-password"
            required
          />
        </label>

        <button className={styles.btn} type="submit" disabled={busy}>
          {busy ? "…" : "Anmelden"}
        </button>
      </form>

      <div className={styles.links}>
        <a className={styles.link} href="/forgot-password">
          Passwort vergessen
        </a>
        <a className={styles.link} href="/register">
          Neu registrieren
        </a>
      </div>
    </div>
  );
}
