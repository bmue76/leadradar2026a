import FormDetailClient from "../FormDetailClient";

export const runtime = "nodejs";

export default function Page({ params }: { params: { id: string } }) {
  return <FormDetailClient formId={params.id} initialTab="builder" />;
}
