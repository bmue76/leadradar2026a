import { AdminPageHeader } from "../_components/AdminPageHeader";

export default function BrandingPage() {
  return (
    <div className="py-2">
      <AdminPageHeader
        title="Branding"
        hint="Hier passt du Logo und Akzentfarbe deines Mandanten an (MVP: Scaffold)."
      />
    </div>
  );
}
