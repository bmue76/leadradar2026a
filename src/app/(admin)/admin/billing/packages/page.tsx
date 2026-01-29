import { AdminPageHeader } from "../../_components/AdminPageHeader";

export default function BillingPackagesPage() {
  return (
    <div className="py-2">
      <AdminPageHeader
        title="Pakete"
        hint="Hier siehst du verfügbare Pakete (30/365 Tage) und kannst später kaufen (MVP: Scaffold)."
      />
    </div>
  );
}
