import { AdminPageHeader } from "../_components/AdminPageHeader";

export default function SettingsPage() {
  return (
    <div className="py-2">
      <AdminPageHeader
        title="Organisation"
        hint="Konto, Firma und Benutzer verwalten (MVP: Scaffold)."
      />
    </div>
  );
}
