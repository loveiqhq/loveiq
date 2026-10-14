/**
 * The sessionStorage key the plans pop-up claims at its point (`claimPlansOffer` in
 * ReportPage), once per submission per tab, in both arms of the pay pop-up test and
 * on phones only. The leave offer reads it to stay out of the 30 seconds that test is
 * judged on, so both sides take the key from here.
 */
export function plansOfferedKey(submissionId: number): string {
  return `loveiq-report-plans-offered:${submissionId}`;
}
