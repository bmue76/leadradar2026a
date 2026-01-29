import { AdminPageHeader } from "../_components/AdminPageHeader";

export default function TemplatesPage() {
  return (
    <div className="py-2">
      <AdminPageHeader
        title="Vorlagen"
        hint="Hier verwaltest du Vorlagen als Basis für neue Formulare (MVP: Scaffold)."
      />
    </div>
  );
}
