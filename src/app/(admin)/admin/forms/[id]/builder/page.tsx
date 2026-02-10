import { Suspense } from "react";
import BuilderShell from "./_components/BuilderShell";
import MobilePreview from "./_components/MobilePreview";

type SearchParams = { mode?: string | string[] };

type PageProps = {
  params: { id: string } | Promise<{ id: string }>;
  searchParams?: SearchParams | Promise<SearchParams>;
};

function LoadingCard() {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="h-6 w-48 animate-pulse rounded bg-slate-100" />
      <div className="mt-3 h-4 w-80 animate-pulse rounded bg-slate-100" />
      <div className="mt-6 h-72 w-full animate-pulse rounded-2xl border border-slate-200 bg-slate-50" />
    </section>
  );
}

export default async function Page({ params, searchParams }: PageProps) {
  const p = await params;
  const sp = searchParams ? await searchParams : {};
  const rawMode = sp?.mode;
  const mode = (Array.isArray(rawMode) ? rawMode[0] : rawMode) === "preview" ? "preview" : "edit";

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-6">
      <Suspense fallback={<LoadingCard />}>
        {mode === "preview" ? (
          <MobilePreview formId={p.id} />
        ) : (
          <BuilderShell formId={p.id} mode="edit" />
        )}
      </Suspense>
    </div>
  );
}
