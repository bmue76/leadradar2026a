import { notFound } from "next/navigation";
import ProvisionClient from "./ProvisionClient";

export const runtime = "nodejs";

export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ProvisionClient />;
}
