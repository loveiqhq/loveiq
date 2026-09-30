import { isNonProdDeploy } from "@shared/env/is-non-prod-deploy";

/**
 * Where the survey sends a reader once the pre-report wizard is done.
 *
 * Off the live site it opens Report V4 (`?v4=1`), the report the wizard now
 * introduces (Fatih, 30.09: "V4 on staging only"). The live site keeps its default
 * report until V4 ships there. isNonProdDeploy() reads an unknown environment as
 * production, so nothing but staging, previews and local dev ever get the flag.
 * Without a token it is the session's own report, `/report`, flagged the same way.
 */
export function reportUrlAfterSurvey(reportToken?: string | null): string {
  const path = reportToken ? `/report/${reportToken}` : "/report";
  return `${path}${isNonProdDeploy() ? "?v4=1" : ""}`;
}
