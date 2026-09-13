import { escapeHtml } from "@shared/format/html-escape";
import { normalizeReportHtml } from "./reportContent";

/**
 * The reader's own snapshot answers, resolved once per report and threaded
 * into both report versions. Shared here rather than owned by one of them so
 * the V1 and V2 experiences cannot drift apart on the placeholder contract.
 */
export interface SnapshotContent {
  importanceLabel: string;
  importancePct: number | null;
  importanceStatusLabel: string;
  importanceValue: number | null;
  satisfactionLabel: string;
  satisfactionPct: number | null;
  satisfactionStatusLabel: string;
  satisfactionValue: number | null;
  stage: string | null;
}

export interface PlaceholderValues {
  archetype: string;
  matchScore: number;
  motto: string;
  reportDate: string;
  snapshot: SnapshotContent;
  userName: string;
}

export function replacePlaceholders(html: string, values: PlaceholderValues) {
  // Every substitution lands in a dangerouslySetInnerHTML; escape every
  // value (user-controlled or server-derived) so a malicious first name or
  // a future server-side change can't inject HTML/script. The labels below
  // are plain text by contract — escaping them is a safe no-op.
  return normalizeReportHtml(
    html
      .replace(/\{\{USER_NAME\}\}/g, escapeHtml(values.userName))
      .replace(
        /\{\{CORE_ARCHETYPE\}\}/g,
        `<span class="report-archetype-name">${escapeHtml(values.archetype)}</span>`
      )
      .replace(/\{\{CORE_ARCHETYPE_SCORE\}\}/g, String(Math.round(values.matchScore)))
      .replace(/\{\{CORE_ARCHETYPE_MOTTO\}\}/g, escapeHtml(values.motto))
      .replace(/\{\{REPORT_DATE\}\}/g, escapeHtml(values.reportDate))
      .replace(/\{\{SEXUAL_STAGE\}\}/g, escapeHtml(values.snapshot.stage ?? ""))
      .replace(/\{\{IMPORTANCE_OF_SEX\}\}/g, escapeHtml(values.snapshot.importanceLabel))
      .replace(/\{\{SEXUAL_SATISFACTION\}\}/g, escapeHtml(values.snapshot.satisfactionLabel))
      .replace(/<table>[\s\S]*?<\/table>/g, "")
  );
}
