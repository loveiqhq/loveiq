# Submissions

The submissions UI (list, detail, compare, partial drafts), its notes, tags, saved views,
bulk actions and CSV export, and the Survey Status switch were removed with the old admin
on 16 Oct 2026. `/admin/submissions` and `/admin/survey-status` now redirect to `/admin/ap`.

## What remains

| Need                        | Where                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Read, correct or delete one | [`app/api/admin/submissions/[id]/route.ts`](../../../app/api/admin/submissions/[id]/route.ts), API only: `GET` (`viewer+`), `PATCH` (`editor+`), `DELETE` (`admin`, through [`features/admin/server/delete-submission.ts`](../../../features/admin/server/delete-submission.ts)). Its `PATCH` is the GDPR Art. 16 rectification `docs/compliance/DPIA.md` names. |
| GDPR export or erasure      | [`app/api/admin/data-subject/route.ts`](../../../app/api/admin/data-subject/route.ts), API only, `admin`, built in [`features/admin/server/data-subject.ts`](../../../features/admin/server/data-subject.ts).                                                                                                                                                    |
| Look at a reader's rows     | The AP raw data explorer (`/admin/ap/explorer`), masked unless an admin unlocks the table. AP's Report page links a reader's submission there.                                                                                                                                                                                                                   |

## Handled in the database now

- **Test submissions:** there is no bulk-delete tool. Clean up the team's own test runs by
  hand, as the testing rules in `CLAUDE.md` say. The team data export still flags likely
  tests (`is_likely_test`, from [`features/admin/server/test-submission.ts`](../../../features/admin/server/test-submission.ts)).
- **Closing the survey:** set `survey.status` to `closed` in the database. `isSurveyClosed()`
  in `features/survey/server/server.ts` reads it (cached 30 seconds, and it lets submissions
  through when the database cannot be read); `/api/survey` and `/api/survey-partial` then
  answer 409. The `survey_submissions` kill switch (`/api/admin/system-flags`) stops them
  with a 503 instead.

Route contracts: [`docs/admin-api.md`](../../admin-api.md).
