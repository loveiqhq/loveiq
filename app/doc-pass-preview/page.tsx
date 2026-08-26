// STAGING-ONLY demo route — unlocked, token-free render of everything the
// 2026-08-26 Spark Seeker document pass added, so it can be reviewed without a
// paid report. 404s on production (NEXT_PUBLIC_SITE_URL guard), exactly like
// `app/practice-preview`.
//
// Server component ON PURPOSE, for the same reason as practice-preview: the
// per-archetype copy module is 660KB and server-only, so the resolving happens
// here and only the resolved strings cross to the client — the same shape the
// real report hands its client sections after access filtering.
import { notFound } from "next/navigation";

import { archetypeSlug } from "@/data/report2-config";
import { report2Copy } from "@/data/report2-copy";
import { getArchetypeSummary } from "@/data/report2-archetype-summary";
import {
  AROUSAL_STYLES,
  AROUSAL_STYLES_OUTRO,
  AROUSAL_STYLE_BY_ARCHETYPE,
  CURIOSITY_STYLES,
  CURIOSITY_STYLES_OUTRO,
  CURIOSITY_STYLE_BY_ARCHETYPE,
  INITIATION_STYLES,
  INITIATION_STYLES_OUTRO,
  INITIATION_STYLE_BY_ARCHETYPE,
  resolveStyles,
} from "@/data/report2-doc-styles";
import { KEY_CONCEPTS_EYEBROW, report2KeyConcepts } from "@/data/report2-key-concepts";
import DocPassPreviewClient from "./DocPassPreviewClient";

const ARCHETYPE = "Spark Seeker";

export default async function DocPassPreviewPage() {
  // Staging-only. Never render on production — guards a staging→main merge.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  if (/\/\/(www\.)?loveiq\.org\b/.test(siteUrl) && !siteUrl.includes("staging")) {
    notFound();
  }

  const slug = archetypeSlug(ARCHETYPE);
  const blocks = report2KeyConcepts[slug] ?? {};
  const keyConcepts = Object.entries(blocks).map(([section, block]) => ({
    section,
    eyebrow: KEY_CONCEPTS_EYEBROW,
    p1: block.p1,
    p2: block.p2 ?? null,
  }));

  // The insecurities chapter as the route resolves it when unlocked, so the new
  // educational expander is seen under the real practical block rather than alone.
  const ins = (report2Copy as Record<string, Record<string, Record<string, string>>>)[slug]
    ?.insecurities;
  const insecuritiesCopy = {
    "practical.label": ins?.["practical.label"] ?? null,
    "learn.eyebrow": KEY_CONCEPTS_EYEBROW,
    "learn.body": blocks.insecurities?.p1 ?? null,
    "learn.body.p2": blocks.insecurities?.p2 ?? null,
    takeaway: ins?.takeaway ?? null,
    "practical.teaser": ins?.["practical.teaser"] ?? null,
    "practical.line1": ins?.["practical.line1"] ?? null,
    "practical.line2": ins?.["practical.line2"] ?? null,
    "practical.line3": ins?.["practical.line3"] ?? null,
    "body.p1": ins?.["body.p1"] ?? null,
    locked: false,
  };

  return (
    <DocPassPreviewClient
      archetype={ARCHETYPE}
      keyConcepts={keyConcepts}
      insecuritiesCopy={insecuritiesCopy}
      curiosityStyles={resolveStyles(CURIOSITY_STYLES, CURIOSITY_STYLE_BY_ARCHETYPE[slug])}
      arousalStyles={resolveStyles(AROUSAL_STYLES, AROUSAL_STYLE_BY_ARCHETYPE[slug])}
      initiationStyles={resolveStyles(INITIATION_STYLES, INITIATION_STYLE_BY_ARCHETYPE[slug])}
      curiosityOutro={CURIOSITY_STYLES_OUTRO}
      arousalOutro={AROUSAL_STYLES_OUTRO}
      initiationOutro={INITIATION_STYLES_OUTRO}
      summary={getArchetypeSummary(slug)}
    />
  );
}
