import Link from "next/link";

export default function AdminFormsPage() {
  return (
    <div className="lr-page">
      <header className="lr-pageHeader">
        <h1 className="lr-h1">Forms</h1>
        <p className="lr-muted">
          Coming soon: Forms List (API vorhanden). Hier kommt als Nächstes die Liste + Status + CTA.
        </p>
      </header>

      <section className="lr-panel">
        <h2 className="lr-h2">Was hier kommt</h2>
        <ul className="lr-bullets">
          <li>Liste aller Forms (DRAFT/ACTIVE/ARCHIVED)</li>
          <li>Quick Actions: View / Edit / Archive</li>
          <li>Empty State: “Create your first form”</li>
        </ul>

        <div className="lr-actions">
          <Link className="lr-btn" href="/admin">Back to Dashboard</Link>
        </div>
      </section>
    </div>
  );
}
