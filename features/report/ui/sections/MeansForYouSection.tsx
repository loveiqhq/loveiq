"use client";

import type { FC } from "react";
import { archetypeSlug, type Report2CopySlug } from "@/data/report2-config";
import { meansForYou } from "@/data/report2-summary";

interface Props {
  archetype: string;
}

/**
 * "What this means for you" (Figma `8719:8865`) — the SUMMARY block that sits
 * between the Hero card and Your Snapshot in Part I.
 *
 * Free and universal in structure, per-archetype in copy. Renders nothing when
 * the archetype has no verified Figma entry, so an unfinished archetype shows
 * no section rather than the wrong voice — see `data/report2-summary.ts`.
 */
const MeansForYouSection: FC<Props> = ({ archetype }) => {
  const copy = meansForYou[archetypeSlug(archetype) as Report2CopySlug];
  if (!copy) return null;

  return (
    <div className="report-means">
      <h2 className="report-means__title">What this means for you</h2>
      <div className="report-means__body">
        <p>
          {copy.lead.before}
          <strong>{copy.lead.bold}</strong>
          {copy.lead.after}
        </p>
        {copy.body.map((para) => (
          <p key={para.slice(0, 40)}>{para}</p>
        ))}
        <p className="report-means__closing">{copy.closing}</p>
      </div>
    </div>
  );
};

export default MeansForYouSection;
