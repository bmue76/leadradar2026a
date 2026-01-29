import { AdminPageHeader } from "../_components/AdminPageHeader";

export default function SettingsPage() {
  return (
    <div className="py-2">
      <AdminPageHeader
        title="Einstellungen"
        hint="Zentrale Einstellungen für Konto, Mandant und Benutzer (MVP: Scaffold)."
      />
    </div>
  );
}
