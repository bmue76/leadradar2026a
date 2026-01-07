import FormDetailClient from "./FormDetailClient";

type PageProps = {
  params: { id: string };
  searchParams?: { tab?: string };
};

export default function Page({ params, searchParams }: PageProps) {
  const tabRaw = typeof searchParams?.tab === "string" ? searchParams.tab : "";
  const initialTab = tabRaw.toLowerCase() === "builder" ? "builder" : "overview";

  return <FormDetailClient formId={params.id} initialTab={initialTab} />;
}
