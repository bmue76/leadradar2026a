import BuilderShell from "./_components/BuilderShell";

export default function BuilderPage({ params }: { params: { id: string } }) {
  return <BuilderShell formId={params.id} />;
}
