import { FormsScreenClient } from "./FormsScreenClient";

export const metadata = {
  title: "Formulare · LeadRadar Admin",
};

export default function AdminFormsPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 pt-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Formulare</h1>
        <p className="text-sm text-slate-600">
          Erstelle, aktiviere und stelle Formulare fürs aktive Event bereit.
        </p>
      </header>

      <FormsScreenClient />
    </div>
  );
}
