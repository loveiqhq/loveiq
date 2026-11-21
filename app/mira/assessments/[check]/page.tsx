import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CHECK_IDS, checkById } from "@features/mira/content/checks";
import { GUIDE_PRACTICES } from "@features/mira/content/guide";
import { miraLinkPreview } from "@features/mira/link-preview";
import { getMiraAccount } from "@features/mira/server/session";
import CheckPage, { BodyCheckPage } from "@features/mira/ui/checks/CheckPage";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ check: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { check } = await params;
  const title = `${check === "body" ? "Body check" : (checkById(check)?.title ?? "Assessment")} | LoveIQ`;
  return {
    title,
    robots: { index: false, follow: false },
    ...miraLinkPreview(`/mira/assessments/${encodeURIComponent(check)}`),
  };
}

/**
 * One self-check (/mira/assessments/anxiety, /mood, /loneliness) or the body check (/body). The
 * check's practice from the body confidence guide is looked up here, so the guide's text stays
 * out of the browser's bundle.
 */
export default async function Page({ params }: Props) {
  const { check } = await params;
  if (check !== "body" && !CHECK_IDS.includes(check as (typeof CHECK_IDS)[number])) notFound();
  if (!(await getMiraAccount())) {
    redirect(`/mira/start?next=${encodeURIComponent(`/mira/assessments/${check}`)}`);
  }
  if (check === "body") return <BodyCheckPage />;
  const def = checkById(check)!;
  const practice = GUIDE_PRACTICES.find((p) => p.number === def.practice);
  return (
    <CheckPage
      checkId={def.id}
      practice={
        practice
          ? {
              number: practice.number,
              name: practice.name,
              time: practice.time,
              bestFor: practice.bestFor,
            }
          : null
      }
    />
  );
}
