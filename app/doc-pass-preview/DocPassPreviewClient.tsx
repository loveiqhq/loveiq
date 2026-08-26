// Client wrapper for the staging-only document-pass preview.
//
// Every block below is the component that ships inside the real report, given
// the copy the real route resolves for the Spark Seeker — so what this page shows
// is what a Spark Seeker report shows, not a mock-up of it. The blocks that need
// a whole chapter around them (the arousal and initiation style lists) are
// rendered as the `DocStyleBlock` they are, without their chapter's chart.
"use client";

import dynamic from "next/dynamic";

import DocStyleBlock from "@features/report/ui/sections/DocStyleBlock";
import FantasyLearnings from "@features/report/ui/sections/FantasyLearnings";
import LearnPill from "@features/report/ui/sections/LearnPill";
import type { InsecuritiesCopy } from "@features/report/ui/sections/InsecuritiesSection";
import type { Report2DocStyle, Report2StyleMatch } from "@/data/report2-doc-styles";

/** Client-only, like the real report, so the reveal animations run. */
const InsecuritiesSection = dynamic(
  () => import("@features/report/ui/sections/InsecuritiesSection"),
  { ssr: false }
);
const KnowHowSection = dynamic(() => import("@features/report/ui/sections/KnowHowSection"), {
  ssr: false,
});
const ClosingSection = dynamic(() => import("@features/report/ui/sections/ClosingSection"), {
  ssr: false,
});

type Style = Report2DocStyle & Report2StyleMatch;

interface Props {
  archetype: string;
  keyConcepts: { section: string; eyebrow: string; p1: string; p2: string | null }[];
  insecuritiesCopy: InsecuritiesCopy;
  curiosityStyles: Style[];
  arousalStyles: Style[];
  initiationStyles: Style[];
  curiosityOutro: string;
  arousalOutro: string;
  initiationOutro: string;
  summary: string[] | null;
}

function Divider({ children }: { children: string }) {
  return (
    <p
      style={{
        margin: "56px 0 18px",
        paddingBottom: 8,
        borderBottom: "1px solid rgba(22,16,33,0.12)",
        color: "#6b6678",
        fontFamily: "var(--font-sans)",
        fontSize: "0.7rem",
        fontWeight: 800,
        letterSpacing: "1.6px",
        textTransform: "uppercase",
      }}
    >
      {children}
    </p>
  );
}

export default function DocPassPreviewClient({
  archetype,
  keyConcepts,
  insecuritiesCopy,
  curiosityStyles,
  arousalStyles,
  initiationStyles,
  curiosityOutro,
  arousalOutro,
  initiationOutro,
  summary,
}: Props) {
  return (
    <div className="report-page" style={{ background: "#ffffff", minHeight: "100vh" }}>
      <div className="content-shell" style={{ paddingTop: 48, paddingBottom: 96 }}>
        <Divider>1 · Key Concepts, one pill per chapter</Divider>
        {keyConcepts.map((kc) => (
          <div key={kc.section} style={{ marginBottom: 34 }}>
            <p
              style={{
                margin: "0 0 8px",
                color: "#a09aac",
                fontFamily: "var(--font-sans)",
                fontSize: "0.68rem",
                letterSpacing: "1.2px",
                textTransform: "uppercase",
              }}
            >
              {kc.section}
            </p>
            <LearnPill
              prefix="beliefs"
              copy={{
                "learn.eyebrow": kc.eyebrow,
                "learn.body": kc.p1,
                "learn.body.p2": kc.p2,
              }}
            />
          </div>
        ))}

        <Divider>2 · Core Insecurities, with the new educational expander</Divider>
        <InsecuritiesSection
          archetype={archetype}
          copy={insecuritiesCopy}
          cueFamily="engulfment"
          graph={null}
          onUnlock={() => {}}
          sectionTitle="Core Insecurities"
        />

        <Divider>3 · Curiosity Level Styles (above the fit table)</Divider>
        <DocStyleBlock
          eyebrow="Common Curiosity Level Styles Across Archetypes"
          styles={curiosityStyles}
          modifier="curiosity"
          outro={curiosityOutro}
        />

        <Divider>4 · Arousal styles (inferred mapping — needs a decision)</Divider>
        <DocStyleBlock
          eyebrow="Arousal styles across the archetypes"
          styles={arousalStyles}
          modifier="arousal"
          outro={arousalOutro}
        />

        <Divider>5 · Initiation style varieties</Divider>
        <DocStyleBlock
          eyebrow="Core Initiation Style Varieties Across Archetypes"
          styles={initiationStyles}
          modifier="initiation"
          outro={initiationOutro}
        />

        <Divider>6 · Fantasy, the three learnings above the map</Divider>
        <article className="report-fantasy__card">
          <FantasyLearnings />
        </article>

        <Divider>7 · Arousal, Desire &amp; Pleasure — the new section</Divider>
        <KnowHowSection />

        <Divider>8 · The closing block, now Summary</Divider>
        <ClosingSection summary={summary} />
      </div>
    </div>
  );
}
