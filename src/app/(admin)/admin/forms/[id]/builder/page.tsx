import BuilderClient from "./BuilderClient";

export default function Page({ params }: { params: { id: string } }) {
  return <BuilderClient formId={params.id} />;
}
