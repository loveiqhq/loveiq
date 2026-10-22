import type { Metadata } from "next";
import { isUnlockReason } from "@features/unlock-feedback/logic/reasons";
import WhyPage from "@features/unlock-feedback/ui/WhyPage";

// Private: one reader's answer, reached only through the email's link. Not in the sitemap.
export const metadata: Metadata = {
  title: "Your answer | LoveIQ",
  robots: { index: false, follow: false },
};

interface Props {
  searchParams: Promise<{ r?: string | string[] }>;
}

export default async function Page({ searchParams }: Props) {
  const { r } = await searchParams;
  return <WhyPage initialReason={isUnlockReason(r) ? r : null} />;
}
