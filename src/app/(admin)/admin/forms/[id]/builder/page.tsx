import BuilderShell from "./_components/BuilderShell";

type RouteCtx = { params: Promise<{ id: string }> };

export default async function BuilderPage(ctx: RouteCtx) {
  const { id } = await ctx.params;
  return <BuilderShell formId={id} />;
}
