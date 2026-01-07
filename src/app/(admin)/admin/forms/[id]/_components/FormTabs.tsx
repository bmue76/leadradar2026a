import Link from "next/link";

type TabKey = "overview" | "builder";

function tabClass(active: boolean) {
  return [
    "inline-flex items-center rounded-full px-3 py-1.5 text-sm",
    active ? "bg-black text-white" : "border bg-white text-gray-700 hover:bg-gray-50",
  ].join(" ");
}

export default function FormTabs({
  formId,
  activeTab,
}: {
  formId: string;
  activeTab: TabKey;
}) {
  const base = `/admin/forms/${formId}`;

  const hrefOverview = base; // clean URL
  const hrefBuilder = `${base}?tab=builder`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={hrefOverview} className={tabClass(activeTab === "overview")}>
        Overview
      </Link>
      <Link href={hrefBuilder} className={tabClass(activeTab === "builder")}>
        Builder
      </Link>

      <div className="ml-2 text-xs text-gray-400">
        One page · no duplicate editor
      </div>
    </div>
  );
}
