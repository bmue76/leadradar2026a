import { AdminPageHeader } from "../../_components/AdminPageHeader";

export default function BillingLicensesPage() {
  return (
    <div className="py-2">
      <AdminPageHeader
        title="Lizenzen"
        hint="Hier verwaltest du Lizenzschlüssel und Device-Bindings (MVP: Scaffold)."
      />
    </div>
  );
}
