import type { Metadata } from "next";
import StagingLoginForm from "@features/staging/ui/StagingLoginForm";

export const metadata: Metadata = {
  title: "Login | LoveIQ Staging",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return <StagingLoginForm />;
}
