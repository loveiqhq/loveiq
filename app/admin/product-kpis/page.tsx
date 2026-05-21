import type { Metadata } from "next";
import ProductKpiDashboard from "@features/admin/ui/ProductKpiDashboard";

export const metadata: Metadata = {
  title: "Product KPIs | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function ProductKpisPage() {
  return <ProductKpiDashboard />;
}
