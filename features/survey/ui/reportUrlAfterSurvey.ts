/**
 * Where the survey sends a reader once the pre-report wizard is done: their report, which
 * is Report 3.0 (V4) by default since it launched. Without a token it is the session's own
 * report, `/report`.
 */
export function reportUrlAfterSurvey(reportToken?: string | null): string {
  return reportToken ? `/report/${reportToken}` : "/report";
}
