"use client";

import { useSearchParams } from "next/navigation";
import { safeNextPath } from "@/lib/safeRedirect";
import LoginForm from "./ui/LoginForm";

export default function LoginClient() {
  const sp = useSearchParams();

  // Nur Admin-Redirects erlauben (harte Allowlist)
  const next = safeNextPath(sp.get("next"), {
    fallback: "/admin",
    allowPrefixes: ["/admin"],
  });

  return <LoginForm next={next} />;
}
