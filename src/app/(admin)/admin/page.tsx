import Link from "next/link";

function Card({
  title,
  description,
  href,
  hint,
}: {
  title: string;
  description: string;
  href: string;
  hint?: string;
}) {
  return (
    <Link
      href={href}
      className="lr-card"
      aria-label={`${title} öffnen`}
    >
      <div className="lr-cardTitle">{title}</div>
      <div className="lr-cardDesc">{description}</div>
      {hint ? <div className="lr-cardHint">{hint}</div> : null}
    </Link>
  );
}

export default function AdminDashboardPage() {
  return (
    <div className="lr-page">
      <header className="lr-pageHeader">
        <h1 className="lr-h1">Dashboard</h1>
        <p className="lr-muted">
          Willkommen bei LeadRadar. Starte mit einem Formular, erfasse Leads und exportiere danach als CSV.
        </p>
      </header>

      <section className="lr-grid">
        <Card
          title="Forms"
          description="Formulare verwalten, Status prüfen und später im Builder bearbeiten."
          href="/admin/forms"
          hint="Next: Forms List (TP 1.3)"
        />
        <Card
          title="Leads"
          description="Leads durchsuchen, Details ansehen und später exportieren/weiterleiten."
          href="/admin/leads"
          hint="Next: Leads List (TP 1.4)"
        />
        <Card
          title="Exports"
          description="CSV-Exports erstellen, Job-Status prüfen und Dateien herunterladen."
          href="/admin/exports"
          hint="Next: Export UI (TP später)"
        />
      </section>

      <section className="lr-panel">
        <div className="lr-panelHeader">
          <h2 className="lr-h2">Next steps</h2>
          <p className="lr-muted">Saubere “Empty/Coming-soon”-States, damit man nie “verloren” ist.</p>
        </div>

        <div className="lr-list">
          <div className="lr-listItem">
            <div className="lr-listTitle">1) Create your first form</div>
            <div className="lr-muted">Lege ein Formular an und setze es auf ACTIVE (sobald UI vorhanden).</div>
            <div className="lr-actions">
              <Link className="lr-btn" href="/admin/forms">Go to Forms</Link>
            </div>
          </div>

          <div className="lr-listItem">
            <div className="lr-listTitle">2) Capture leads</div>
            <div className="lr-muted">Mobile (Phase 3.x) nutzt ACTIVE Forms — Admin ist die Quelle.</div>
            <div className="lr-actions">
              <Link className="lr-btnSecondary" href="/admin/leads">View Leads</Link>
            </div>
          </div>

          <div className="lr-listItem">
            <div className="lr-listTitle">3) Export CSV</div>
            <div className="lr-muted">Nach der Messe Export erstellen, herunterladen und ins CRM importieren.</div>
            <div className="lr-actions">
              <Link className="lr-btnSecondary" href="/admin/exports">Open Exports</Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
