"use client";

import { type FC } from "react";
import {
  extractReportHtmlBlocks,
  getReportBlockText,
  joinReportHtmlBlocks,
} from "../reportContent";
import SexualStageExplorer from "./SexualStageExplorer";

interface Props {
  generalHtml: string;
  userStageLabel: string | null;
}

const INTRO_END_MARKER = "clarity where there was confusion";

const SexualStageSection: FC<Props> = ({ generalHtml, userStageLabel }) => {
  const blocks = extractReportHtmlBlocks(generalHtml);

  let introBlocks = blocks;
  const introEndIdx = blocks.findIndex((block) =>
    getReportBlockText(block).toLowerCase().includes(INTRO_END_MARKER)
  );

  if (introEndIdx >= 0) {
    introBlocks = blocks.slice(0, introEndIdx + 1);
  }

  const introHtml = joinReportHtmlBlocks(introBlocks);

  return (
    <div className="report-flow report-flow--gap-xl">
      {introHtml ? (
        <div className="report-prose" dangerouslySetInnerHTML={{ __html: introHtml }} />
      ) : null}

      <SexualStageExplorer userStageLabel={userStageLabel} />
    </div>
  );
};

export default SexualStageSection;
