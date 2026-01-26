import BuilderShell from "./_components/BuilderShell";

type Params = { id: string };

export default async function BuilderPage({ params }: { params: Params | Promise<Params> }) {
  const { id } = await Promise.resolve(params);
  return <BuilderShell formId={id} />;
}
