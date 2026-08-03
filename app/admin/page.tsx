import { redirect } from "next/navigation";

// The admin home is now Core KPIs (the Command Center was removed in the
// 2026-07 admin cleanup). Land admins straight on the KPIs dashboard.
export default function AdminPage() {
  redirect("/admin/analytics");
}
