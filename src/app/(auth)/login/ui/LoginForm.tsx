"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import styles from "../../_components/AuthForm.module.css";

export type LoginFormProps = {
  next?: string;
  verified?: "1" | "0" | null;
};

export default function LoginForm({ next = "/admin", verified = null }: LoginFormProps) {
  const router = useRouter();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
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

      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        const msg = json?.error?.message || "Login fehlgeschlagen.";
        setError(msg);
        return;
      }

      router.push(next || "/admin");
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
          required
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
          required
        />
      </div>

      <button className={styles.button} type="submit" disabled={loading}>
        {loading ? "Anmelden…" : "Anmelden"}
      </button>

      <div className={styles.links}>
        <a className={styles.link} href="/forgot-password">
          Passwort vergessen
        </a>
        <a className={styles.link} href="/register">
          Neu registrieren
        </a>
      </div>
    </form>
  );
}
