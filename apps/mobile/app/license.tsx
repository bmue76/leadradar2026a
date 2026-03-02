import { useEffect } from "react";
import { useRouter } from "expo-router";

export default function LicenseLegacyRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/activate");
  }, [router]);

  return null;
}
