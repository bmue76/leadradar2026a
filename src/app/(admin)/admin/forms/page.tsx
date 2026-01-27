import { FormsListClient } from "./FormsListClient";
import { FormsActionsClient } from "./FormsActionsClient";

export const metadata = {
  title: "Forms · LeadRadar Admin",
};

export default function AdminFormsPage() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Forms</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Create and manage your lead capture forms. Use search and filters to find what you need fast.
          </p>
        </div>

        <FormsActionsClient />
      </div>

      <FormsListClient />
    </div>
  );
}
