import { AdminPageHeader } from "../../_components/AdminPageHeader";

export default function BillingOrdersPage() {
  return (
    <div className="py-2">
      <AdminPageHeader
        title="Bestellungen"
        hint="Hier findest du Bestellungen und Zahlungsstatus (MVP: Scaffold)."
      />
    </div>
  );
}
