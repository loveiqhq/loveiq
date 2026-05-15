import type { Metadata } from "next";
import AdminLoginForm from "@features/admin/ui/AdminLoginForm";

export const metadata: Metadata = {
  title: "Admin Login | LoveIQ",
  robots: { index: false, follow: false },
};

export default function AdminLoginPage() {
  return <AdminLoginForm />;
}
