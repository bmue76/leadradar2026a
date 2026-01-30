import { FormsScreenClient } from "./FormsScreenClient";

export const metadata = {
  title: "Formulare · LeadRadar Admin",
};

export default function AdminFormsPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-6">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Formulare</h1>
        <p className="mt-2 text-sm text-slate-600">
          Erstelle, aktiviere und stelle Formulare fürs aktive Event bereit.
        </p>
      </header>

      <FormsScreenClient />
    </div>
  );
}
