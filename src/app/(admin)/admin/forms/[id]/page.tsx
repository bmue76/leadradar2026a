import FormDetailClient from "./FormDetailClient";

type Params = { id: string };

export default async function Page({ params }: { params: Params | Promise<Params> }) {
  const { id } = await Promise.resolve(params);
  return <FormDetailClient formId={id} initialTab="builder" />;
}
