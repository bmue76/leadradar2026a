import Link from "next/link";

export const metadata = {
  title: "Form · LeadRadar Admin",
};

export default async function AdminFormDetailPlaceholderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold text-zinc-900">Form</h1>
          <p className="mt-1 text-sm text-zinc-600">Detail screen is coming in Teilprojekt 1.4.</p>
        </div>

        <Link
          href="/admin/forms"
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-400"
        >
          ← Back
        </Link>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-5">
        <div className="text-sm font-medium text-zinc-900">Placeholder</div>
        <p className="mt-2 text-sm text-zinc-700">
          Form ID: <span className="font-mono text-xs">{id}</span>
        </p>
        <p className="mt-3 text-sm text-zinc-600">
          In TP 1.4 we will implement: form details, fields list, CRUD, and reorder.
        </p>
      </div>
    </div>
  );
}
