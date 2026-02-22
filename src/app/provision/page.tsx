import ProvisionClient from "./ProvisionClient";

export default function Page({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const tenant = typeof searchParams?.tenant === "string" ? searchParams?.tenant : "";
  const code = typeof searchParams?.code === "string" ? searchParams?.code : "";
  return <ProvisionClient tenant={tenant} code={code} />;
}
