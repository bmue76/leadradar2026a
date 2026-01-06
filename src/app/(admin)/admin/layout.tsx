import type { Metadata } from "next";
import AdminShell from "./_components/AdminShell";
import "./_styles/tokens.css";

export const metadata: Metadata = {
  title: "LeadRadar Admin",
  description: "LeadRadar Admin UI",
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
