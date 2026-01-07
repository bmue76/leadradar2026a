import BuilderClient from "./BuilderClient";

export default async function AdminFormBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <BuilderClient formId={id} />;
}
