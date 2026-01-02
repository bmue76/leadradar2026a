import type { Metadata } from "next";
import LeadsClient from "./LeadsClient";

export const metadata: Metadata = {
  title: "Leads · LeadRadar",
};

export default function AdminLeadsPage() {
  return <LeadsClient />;
}
