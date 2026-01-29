import { AdminPageHeader } from "../_components/AdminPageHeader";

export default function DevicesPage() {
  return (
    <div className="py-2">
      <AdminPageHeader
        title="Geräte"
        hint="Hier verwaltest du verbundene Geräte und Zuweisungen (MVP: Scaffold)."
      />
    </div>
  );
}
