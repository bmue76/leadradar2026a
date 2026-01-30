import { FormsScreenClient } from "./FormsScreenClient";

export const metadata = {
  title: "Formulare · LeadRadar Admin",
};

export default function AdminFormsPage() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Formulare</h1>
        <p className="mt-2 text-sm text-slate-600">
          Erstelle, aktiviere und stelle Formulare fürs aktive Event bereit.
        </p>
      </header>

      <FormsScreenClient />
    </div>
  );
}
