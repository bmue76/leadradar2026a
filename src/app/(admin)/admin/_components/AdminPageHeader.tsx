import type { ReactNode } from "react";

type AdminPageHeaderProps = {
  title: string;
  hint: string;
  actions?: ReactNode;
};

export function AdminPageHeader({ title, hint, actions }: AdminPageHeaderProps) {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-2 text-sm text-slate-600">{hint}</p>
        </div>

        {actions ? <div className="shrink-0 pt-0.5">{actions}</div> : null}
      </div>
    </div>
  );
}
