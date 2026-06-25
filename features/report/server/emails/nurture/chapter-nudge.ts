import { escapeHtml } from "@shared/emails/shared";
import {
  renderNurtureEmail,
  type RenderedNurture,
} from "@features/report/server/emails/nurture/shared";

/**
 * "Chapter by chapter" drip email.
 *
 * Reuses the shared nurture template (`renderNurtureEmail`) so the look matches
 * what we already send. Layout reads:
 *
 *   <chapter title>                                    (heading)
 *   TODAY · CHAPTER X OF N                             (intro, eyebrow line)
 *   Hi <name>,
 *   here's today's chapter from your report.
 *   What you'll learn: <one-liner>
 *   <~100 words of the user's archetype prose, cut … >  (preCtaNote)
 *   <"your full chapter goes deeper…" archetype nudge>  (preCtaNote2)
 *   [ Continue reading your full chapter → ]            (CTA → /report)
 *   <testimonial> · sign-off
 *
 * No promo code: the CTA link directs to the report at its flat current price
 * (the time-decay ladder was retired 2026-06). The in-card logo header is hidden
 * (Figma 7725-11594); branding comes
 * from the mail client's sender avatar. `teaseText` is plain text and is escaped
 * here.
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
  /**
   * The user's normalized primary archetype display name (e.g. "Spiritual
   * Lover"). Pluralized into the pre-CTA nudge ("…most Spiritual Lovers carry
   * quietly…"). Falls back to a generic, name-free nudge when empty.
   */
  archetypeName?: string | null;
}

/**
 * Add the correct plural suffix to a single noun: `es` after a sibilant
 * ending (s/x/z/ch/sh), `s` otherwise.
 */
function addPluralSuffix(word: string): string {
  return /(?:s|x|z|ch|sh)$/i.test(word) ? `${word}es` : `${word}s`;
}

/**
 * Pluralize an archetype display name for the "…most {Archetypes}…" nudge.
 * Most names are "Adjective Noun" → the trailing noun takes the suffix
 * ("Spiritual Lover" → "Spiritual Lovers"). Names with an "X of Y" shape
 * ("Explorer of Edges") pluralize the head noun, never the object after "of"
 * ("Explorers of Edges"). Returns "" for blank input.
 */
export function pluralizeArchetype(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";
  const ofIndex = trimmed.toLowerCase().indexOf(" of ");
  if (ofIndex !== -1) {
    const head = trimmed.slice(0, ofIndex);
    const rest = trimmed.slice(ofIndex); // leading " of …"
    return `${addPluralSuffix(head)}${rest}`;
  }
  return addPluralSuffix(trimmed);
}

export function chapterNudgeEmail(params: ChapterNudgeEmailParams): RenderedNurture {
  const eyebrow = `Today · Chapter ${params.chapterIndex} of ${params.chapterTotal}`;

  // Collapse control chars before escaping (defence-in-depth) and fall back to
  // "there" when no name is on file.
  const trimmedName = (params.firstName ?? "").replace(/[\r\n\t]+/g, " ").trim();
  const greeting = trimmedName ? `Hi ${escapeHtml(trimmedName)},` : "Hi there,";

  // `intro` accepts trusted server HTML; `\n` becomes <br /> in the renderer.
  // Dynamic values (eyebrow, name, one-liner) are escaped before injection.
  const intro =
    `<span style="display:inline-block; font-size:13px; font-weight:700; letter-spacing:0.5px; text-transform:uppercase; color:#5900AC;">${escapeHtml(eyebrow)}</span>\n` +
    `${greeting}\n` +
    `here's today's chapter from your report.\n` +
    `<strong>What you'll learn:</strong> ${escapeHtml(params.whatYoullLearn)}`;

  // `preCtaNote` renders inside its own <p>; teaseText is plain text so we
  // escape it, then add a muted ellipsis to signal the cut-off when truncated.
  const teaseHtml =
    escapeHtml(params.teaseText) +
    (params.wasTruncated ? ' <span style="color:#9ca3af;">…</span>' : "");

  // `preCtaNote2`: the "read the full chapter" nudge, now ABOVE the CTA. Names
  // the user's archetype (pluralized, escaped) when known, else a generic line.
  const archetypePlural = params.archetypeName
    ? escapeHtml(pluralizeArchetype(params.archetypeName))
    : "";
  const fullChapterNudge = archetypePlural
    ? `<strong>Your full chapter goes much deeper into what this looks like for you</strong> — including the <strong>insecurities that most ${archetypePlural} carry quietly</strong>, and how they tend to show up in the way you access desire and speak your needs.`
    : `<strong>Your full chapter goes much deeper into what this looks like for you</strong> — including the <strong>insecurities most people carry quietly</strong>, and how they tend to show up in the way you access desire and speak your needs.`;

  return renderNurtureEmail({
    subject: `A peek inside your report: ${params.chapterTitle}`,
    previewText: params.whatYoullLearn,
    siteUrl: params.siteUrl,
    unsubscribeUrl: params.unsubscribeUrl,
    hideBrandHeader: true,
    body: {
      heading: params.chapterTitle,
      intro,
      preCtaNote: teaseHtml,
      preCtaNote2: fullChapterNudge,
      ctaLabel: "Continue reading your full chapter",
      ctaUrl: params.ctaUrl,
    },
  });
}
