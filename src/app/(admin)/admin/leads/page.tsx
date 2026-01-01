import Link from "next/link";

export default function AdminLeadsPage() {
  return (
    <div className="lr-page">
      <header className="lr-pageHeader">
        <h1 className="lr-h1">Leads</h1>
        <p className="lr-muted">
          Coming soon: Leads List + Filter + Paging + Detail View (API kommt nach Forms UI).
        </p>
      </header>

      <section className="lr-panel">
        <h2 className="lr-h2">Was hier kommt</h2>
        <ul className="lr-bullets">
          <li>Filter (Form, Datum, Status/Flags)</li>
          <li>Paging/Sorting</li>
          <li>Lead Detail inkl. Attachments Download</li>
        </ul>

        <div className="lr-actions">
          <Link className="lr-btn" href="/admin">Back to Dashboard</Link>
        </div>
      </section>
    </div>
  );
}
