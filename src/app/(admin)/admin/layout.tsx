import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AdminShell } from "./_components/AdminShell";

export const metadata: Metadata = {
  title: "LeadRadar Admin",
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
