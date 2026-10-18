# features/unlock-feedback/

"Why didn't you unlock your report?" (Marcus's epic, 18 Oct 2026). Three hours after a new
report, an unpaid reader gets an email with nine one-tap answers. A tap opens `/why`, which
records the answer once the page has loaded in a browser, unlocks the full report for free and
asks an optional follow-up. The admin's "Unlock feedback" page (AP-Analytics) reads it all.

## Pieces

| Piece                               | Where                                                    |
| ----------------------------------- | -------------------------------------------------------- |
| The table, one row per reader       | `supabase/migrations/20261018200000_unlock_feedback.sql` |
| The nine answers and all their copy | `logic/reasons.ts`                                       |
| The four subject lines (A to D)     | `logic/subjects.ts`                                      |
| The link token (only its hash kept) | `server/link.ts`                                         |

## Rules

- **An answer counts only when `/why` has loaded in a browser** (its script posts it). Mail
  scanners open every link with a plain GET: a GET records nothing.
- **First answer kept** in `first_reason`; `reason` is the answer now (the page can change it).
- **Never for a buyer:** the send skips anyone with any paid plan, and `/why` grants nothing to
  someone who bought after the email (`already_paid`).
- **The unlock is a 0 payment** with `metadata.plan = "full_report"` and
  `metadata.source = "unlock_feedback"`: counted as gifted, never as a sale.
- **The 72h discount email skips anyone this email went to** (Eman, 18 Oct).
- **New reports only:** nothing is sent for a report created before the launch.
