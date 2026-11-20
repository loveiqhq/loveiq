import type { Metadata } from "next";
import StagingLoginForm from "@features/staging/ui/StagingLoginForm";
import { PRIVATE_PAGE_METADATA } from "@shared/seo/private-page";

export const metadata: Metadata = {
  title: "Login | LoveIQ Staging",
  ...PRIVATE_PAGE_METADATA,
};

export default function LoginPage() {
  return <StagingLoginForm />;
}
