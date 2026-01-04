"use client";

import * as React from "react";
import styles from "../../_components/AuthForm.module.css";

const COUNTRIES: Array<{ code: string; label: string }> = [
  { code: "CH", label: "Schweiz" },
  { code: "DE", label: "Deutschland" },
  { code: "AT", label: "Österreich" },
  { code: "FR", label: "Frankreich" },
  { code: "IT", label: "Italien" },
  { code: "US", label: "USA" }
];

export default function RegisterForm() {
  const [company, setCompany] = React.useState("");
  const [country, setCountry] = React.useState("CH");
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");

  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [debugUrl, setDebugUrl] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setDebugUrl(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          company,
          country,
          firstName: firstName.trim() || undefined,
          lastName,
          email,
          password,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json?.ok) {
        setError(json?.error?.message || "Registrierung fehlgeschlagen.");
        return;
      }

      setSuccess(json?.data?.message || "Bitte bestätige deine E-Mail.");
      setDebugUrl(json?.data?.debugVerifyUrl || null);
    } catch {
      setError("Registrierung fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={onSubmit}>
      {error ? <div className={styles.error}>{error}</div> : null}
      {success ? <div className={styles.success}>{success}</div> : null}
      {debugUrl ? (
        <div className={styles.success}>
          DEV Link (nur lokal): <a href={debugUrl}>{debugUrl}</a>
        </div>
      ) : null}

      <div className={styles.field}>
        <div className={styles.labelRow}>
          <div className={styles.label}>Unternehmen *</div>
        </div>
        <input
          className={styles.input}
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder="Firma AG"
        />
      </div>

      <div className={styles.field}>
        <div className={styles.labelRow}>
          <div className={styles.label}>Land *</div>
        </div>
        <select className={styles.select} value={country} onChange={(e) => setCountry(e.target.value)}>
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </select>
        <div className={styles.help}>Pflichtangabe (ISO2). Weitere Länder können wir später ergänzen.</div>
      </div>

      <div className={styles.row2}>
        <div className={styles.field}>
          <div className={styles.labelRow}>
            <div className={styles.label}>Vorname</div>
            <div className={styles.hint}>optional</div>
          </div>
          <input
            className={styles.input}
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="Beat"
          />
        </div>

        <div className={styles.field}>
          <div className={styles.labelRow}>
            <div className={styles.label}>Nachname *</div>
          </div>
          <input
            className={styles.input}
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Müller"
          />
        </div>
      </div>

      <div className={styles.field}>
        <div className={styles.labelRow}>
          <div className={styles.label}>Business E-Mail *</div>
        </div>
        <input
          className={styles.input}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@firma.ch"
          inputMode="email"
          autoComplete="email"
        />
        <div className={styles.help}>
          Keine Freemail-Domains wie gmail.com / gmx / yahoo / outlook etc.
        </div>
      </div>

      <div className={styles.field}>
        <div className={styles.labelRow}>
          <div className={styles.label}>Passwort *</div>
        </div>
        <input
          className={styles.input}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          autoComplete="new-password"
          placeholder="Mind. 8 Zeichen"
        />
      </div>

      <button className={styles.button} type="submit" disabled={loading}>
        {loading ? "Registrieren…" : "Registrieren"}
      </button>

      <div className={styles.links}>
        <a className={styles.link} href="/auth/login">
          Zurück zum Login
        </a>
        <span />
      </div>
    </form>
  );
}
