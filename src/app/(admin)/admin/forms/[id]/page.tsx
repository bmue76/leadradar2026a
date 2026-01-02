import FormDetailClient from "./FormDetailClient";

export default async function AdminFormDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <FormDetailClient formId={id} />;
}
