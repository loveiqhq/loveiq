import type { Metadata } from "next";
import ProductKpiDashboard from "@/components/admin/ProductKpiDashboard";

export const metadata: Metadata = {
  title: "Product KPIs | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function ProductKpisPage() {
  return <ProductKpiDashboard />;
}
