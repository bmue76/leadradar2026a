import BuilderClient from "./BuilderClient";

export const runtime = "nodejs";

export default function Page({ params }: { params: { id: string } }) {
  return <BuilderClient formId={params.id} />;
}
