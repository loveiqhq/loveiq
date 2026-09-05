import type { FC } from "react";

/**
 * V3 Introduction — Figma 10392:18457 (glow heading) + 10392:18463 (prose).
 *
 * Universal copy, identical for every archetype and every plan, transcribed
 * from the frame. It opens the report above the Part I divider.
 */
const V3Intro: FC = () => (
  <>
    <div className="rv3-glow rv3-intro-heading" data-node-id="10392:18457">
      <p className="rv3-intro-heading__text">Introduction</p>
    </div>

    <div className="rv3-prose" data-node-id="10392:18463">
      <p>
        Thank you for your trust, and{" "}
        <strong>congratulations on having the courage to look inward.</strong>
      </p>
      <p>
        Many people grow up absorbing narratives about sexuality that create shame, confusion, or a
        sense of being &ldquo;wrong&rdquo;. At LoveIQ,{" "}
        <strong>we offer you a different lens with</strong> evidence-based insights rooted in
        compassion, context, and self-acceptance.
      </p>
      <p>
        This report won&rsquo;t tell you who you are.
        <br />
        Instead, it will help you understand why certain patterns feel familiar, why certain
        challenges keep repeating,{" "}
        <strong>and exactly what you can do, starting today, to move forward.</strong>
      </p>
    </div>
  </>
);

export default V3Intro;
