"use client";

import { useState } from "react";
import PreReportWizard from "@features/survey/ui/PreReportWizard";
import type { WizardVariant } from "@features/survey/ui/wizard/wizardContent";

/**
 * The wizard as a survey finisher meets it, with two differences: it tracks nothing,
 * so a reviewer's clicks never reach the funnel's events, and where the real flow
 * would open the report (CONTINUE on the last slide, or SKIP INTRO) it starts over.
 */
export default function WizardPreviewClient({
  variant = "standard",
  gatePriceCents = null,
}: {
  variant?: WizardVariant;
  gatePriceCents?: number | null;
}) {
  const [run, setRun] = useState(0);
  return (
    <PreReportWizard
      key={run}
      track={false}
      variant={variant}
      gatePriceCents={gatePriceCents}
      onComplete={() => setRun((r) => r + 1)}
    />
  );
}
