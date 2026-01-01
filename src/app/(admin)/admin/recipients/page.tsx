import Link from "next/link";

export default function AdminRecipientsPage() {
  return (
    <div className="lr-page">
      <header className="lr-pageHeader">
        <h1 className="lr-h1">Recipients</h1>
        <p className="lr-muted">
          Placeholder: Recipient Lists (z. B. für Forward/CSV Mail). Kommt nach Forms/Leads.
        </p>
      </header>

      <section className="lr-panel">
        <h2 className="lr-h2">Geplant</h2>
        <ul className="lr-bullets">
          <li>Listen verwalten</li>
          <li>Entries hinzufügen/importieren</li>
          <li>Verwendung in Export/Forward Workflows</li>
        </ul>

        <div className="lr-actions">
          <Link className="lr-btn" href="/admin">Back to Dashboard</Link>
        </div>
      </section>
    </div>
  );
}
