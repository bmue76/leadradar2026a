type AdminPageHeaderProps = {
  title: string;
  hint: string;
};

export function AdminPageHeader({ title, hint }: AdminPageHeaderProps) {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-slate-600">{hint}</p>
    </div>
  );
}
