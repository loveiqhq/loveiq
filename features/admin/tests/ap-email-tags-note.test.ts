import { describe, expect, it } from "vitest";

import { fields as report } from "@features/admin/ui/ap/fields/report";
import { fields as traffic } from "@features/admin/ui/ap/fields/traffic";
import { EMAIL_LINKS_TAGGED_FROM } from "@shared/emails/email-link";

/**
 * Every customer email's links carry utm tags from #704's release (shared/emails/email-link.ts):
 * returns move from "Report or invite email" to "Email campaign", visits from Direct to Email.
 * The ⓘ text names the day, so the shift is not read as readers behaving differently.
 */
describe("AP-Analytics names the day the email links were tagged", () => {
  it.each(["report.via_email", "report.return_sources"])("in %s", (key) => {
    const caveat = report[key]?.caveat ?? "";
    expect(caveat).toContain(`From ${EMAIL_LINKS_TAGGED_FROM} every email's links`);
    expect(caveat).toContain('"Email campaign"');
  });

  it("where it counts visitors with a source", () => {
    expect(traffic["traffic.withSource"]?.caveat).toContain(
      `From ${EMAIL_LINKS_TAGGED_FROM} every email's links carry utm tags`
    );
  });
});
