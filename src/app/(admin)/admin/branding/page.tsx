import { redirect } from "next/navigation";

export default function AdminBrandingRedirect() {
  redirect("/admin/settings/branding");
}
