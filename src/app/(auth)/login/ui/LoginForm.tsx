"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "../../_components/AuthForm.module.css";

export default function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();

  const verified = sp.get("verified"); // "1" or "0"
  const [email, setEmail] = React.useState("admin@leadradar.local");
  const [password, setPassword] = React.useState("CHANGE_ME_OWNER_PASSWORD");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();

      if (!res.ok || !json?.ok) {
        const msg = json?.error?.message || "Login fehlgeschlagen.";
        setError(msg);
        return;
      }

      router.push("/admin");
      router.refresh();
    } catch {
      setError("Login fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={onSubmit}>
      {verified === "1" ? (
        <div className={styles.success}>E-Mail bestätigt. Du kannst dich jetzt anmelden.</div>
      ) : null}
      {verified === "0" ? (
        <div className={styles.error}>Verifizierungs-Link ist ungültig oder abgelaufen.</div>
      ) : null}

      {error ? <div className={styles.error}>{error}</div> : null}

      <div className={styles.field}>
        <div className={styles.labelRow}>
          <div className={styles.label}>Business E-Mail</div>
        </div>
        <input
          className={styles.input}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          inputMode="email"
          placeholder="name@firma.ch"
        />
      </div>

      <div className={styles.field}>
        <div className={styles.labelRow}>
          <div className={styles.label}>Passwort</div>
        </div>
        <input
          className={styles.input}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
        />
      </div>

      <button className={styles.button} type="submit" disabled={loading}>
        {loading ? "Anmelden…" : "Anmelden"}
      </button>

      <div className={styles.links}>
        <a className={styles.link} href="/auth/forgot-password">
          Passwort vergessen
        </a>
        <a className={styles.link} href="/auth/register">
          Neu registrieren
        </a>
      </div>
    </form>
  );
}
