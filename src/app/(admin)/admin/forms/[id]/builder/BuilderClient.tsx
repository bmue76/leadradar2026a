"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function BuilderClient({ formId }: { formId: string }) {
  const router = useRouter();

  useEffect(() => {
    router.replace(`/admin/forms/${formId}?tab=builder`);
  }, [router, formId]);

  return null;
}
