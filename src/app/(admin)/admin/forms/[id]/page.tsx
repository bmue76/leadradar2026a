import Link from "next/link";
import FormDetailClient from "./FormDetailClient";

type Params = { id: string };

export default async function Page({ params }: { params: Params | Promise<Params> }) {
  const { id } = await Promise.resolve(params);

  return (
    <div className="lr-page">
      <div className="lr-toolbar">
        <div className="lr-toolbarLeft">
          <Link href="/admin/forms" className="lr-btnSecondary">
            ← Back to Forms
          </Link>
        </div>

        <div className="lr-toolbarRight">
          <Link href={`/admin/forms/${id}/builder`} className="lr-btn">
            Open Builder
          </Link>
        </div>
      </div>

      <FormDetailClient formId={id} initialTab="builder" />
    </div>
  );
}
