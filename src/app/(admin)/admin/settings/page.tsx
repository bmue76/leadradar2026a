import Link from "next/link";

export default function AdminSettingsPage() {
  return (
    <div className="lr-page">
      <header className="lr-pageHeader">
        <h1 className="lr-h1">Settings</h1>
        <p className="lr-muted">
          Tenant Settings (MVP). Branding ist live: Logo Upload + Placeholder + Topbar-Integration.
        </p>
      </header>

      <section className="lr-panel">
        <h2 className="lr-h2">Branding</h2>
        <p className="lr-muted">
          Logo pro Tenant hochladen. Anzeige ohne Verfälschung: max-height, width:auto, object-fit:contain.
        </p>

        <div className="lr-actions">
          <Link className="lr-btn" href="/admin/settings/branding">Open Branding</Link>
          <Link className="lr-btn" href="/admin">Back to Dashboard</Link>
        </div>
      </section>

      <section className="lr-panel">
        <h2 className="lr-h2">Geplant</h2>
        <ul className="lr-bullets">
          <li>Tenant Retention (z. B. 365 Tage)</li>
          <li>Branding/Theme Defaults (mehr als nur Logo)</li>
          <li>User/Roles (später, Auth.js)</li>
        </ul>
      </section>
    </div>
  );
}
