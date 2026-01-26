import { redirect } from "next/navigation";

type Params = { id: string };

export default async function Page({ params }: { params: Params | Promise<Params> }) {
  const { id } = await Promise.resolve(params);
  redirect(`/admin/forms/${id}/builder`);
}
