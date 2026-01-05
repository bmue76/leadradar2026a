import LoginClient from "./LoginClient";

type SearchParams = Record<string, string | string[] | undefined>;
type VerifiedFlag = "0" | "1" | null;

function first(sp: SearchParams, key: string): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;

  const next = first(sp, "next") ?? "/admin";

  const verifiedRaw = first(sp, "verified");
  const verified: VerifiedFlag =
    verifiedRaw === "0" || verifiedRaw === "1" ? verifiedRaw : null;

  return <LoginClient next={next} verified={verified} />;
}
