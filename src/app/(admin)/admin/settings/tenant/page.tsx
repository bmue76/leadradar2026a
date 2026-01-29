import { AdminPageHeader } from "../../_components/AdminPageHeader";

export default function SettingsTenantPage() {
  return (
    <div className="py-2">
      <AdminPageHeader
        title="Mandant"
        hint="Mandanten-Einstellungen wie Name, Branding und Defaults (MVP: Scaffold)."
      />
    </div>
  );
}
