import { escapeHtml } from "@shared/emails/shared";
import {
  renderNurtureEmail,
  TESTIMONIAL_DIJANA,
  TESTIMONIAL_GEBHARDT,
  type RenderedNurture,
} from "@features/report/server/emails/nurture/shared";

/**
 * "Chapter by chapter" drip email.
 *
 * Reuses the existing nurture template (`renderNurtureEmail`) verbatim so the
 * look matches what we already send. Layout reads:
 *
 *   <chapter title>                                    (heading)
 *   TODAY · CHAPTER X OF N                             (intro, eyebrow line)
 *   <name>, here's today's chapter from your report.
 *   What you'll learn: <one-liner>
 *   <~150 words of the user's archetype prose, cut … >  (preCtaNote)
 *   [ Continue reading your full chapter → ]            (CTA → /report)
 *   <testimonial> · <closing> · sign-off
 *
 * No promo code: the CTA link rides the report's existing time-based price
 * ladder. `teaseText` is plain text and is escaped here.
 */
export interface ChapterNudgeEmailParams {
  firstName: string | null;
  ctaUrl: string;
  siteUrl: string;
  unsubscribeUrl?: string;
  chapterIndex: number;
  chapterTotal: number;
  chapterTitle: string;
  whatYoullLearn: string;
  teaseText: string;
  wasTruncated: boolean;
}

export function chapterNudgeEmail(params: ChapterNudgeEmailParams): RenderedNurture {
  const eyebrow = `Today · Chapter ${params.chapterIndex} of ${params.chapterTotal}`;
  const line2 = params.firstName
    ? `${escapeHtml(params.firstName)}, here's today's chapter from your report.`
    : "Here's today's chapter from your report.";

  // `intro` accepts trusted server HTML; `\n` becomes <br /> in the renderer.
  // Dynamic values (eyebrow, name, one-liner) are escaped before injection.
  const intro =
    `<span style="display:inline-block; font-size:13px; font-weight:700; letter-spacing:0.5px; text-transform:uppercase; color:#5900AC;">${escapeHtml(eyebrow)}</span>\n` +
    `${line2}\n` +
    `<strong>What you'll learn:</strong> ${escapeHtml(params.whatYoullLearn)}`;

  // `preCtaNote` renders inside its own <p>; teaseText is plain text so we
  // escape it, then add a muted ellipsis to signal the cut-off when truncated.
  const teaseHtml =
    escapeHtml(params.teaseText) +
    (params.wasTruncated ? ' <span style="color:#9ca3af;">…</span>' : "");

  const testimonial = params.chapterIndex % 2 === 0 ? TESTIMONIAL_DIJANA : TESTIMONIAL_GEBHARDT;

  return renderNurtureEmail({
    subject: `Chapter ${params.chapterIndex} of ${params.chapterTotal}: ${params.chapterTitle}`,
    previewText: params.whatYoullLearn,
    siteUrl: params.siteUrl,
    unsubscribeUrl: params.unsubscribeUrl,
    body: {
      heading: params.chapterTitle,
      intro,
      preCtaNote: teaseHtml,
      ctaLabel: "Continue reading your full chapter",
      ctaUrl: params.ctaUrl,
      testimonial,
      closingNote:
        "This is just a glimpse — your full chapter goes much deeper into what it means for you.",
    },
  });
}
