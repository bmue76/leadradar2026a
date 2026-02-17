import { redirect } from "next/navigation";

export default function BillingSettingsRedirect() {
  redirect("/admin/billing/accounting");
}
