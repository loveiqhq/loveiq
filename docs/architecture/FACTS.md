# The answers people keep getting wrong

> One page for the handful of facts the company brain has been measured answering
> incorrectly — not because retrieval failed, but because the correct answer was written
> down nowhere, or was written down somewhere that ranked below something plausible.
>
> Each entry names the wrong answer it exists to displace, so nobody deletes it later
> wondering why it was ever here. Sourced from a 468-question audit on 2026-09-10.

## The 14 archetypes: the current names

Sensual Connector · Spark Seeker · Relational Nurturer · Radiant Performer ·
Explorer of Edges · Curious Apprentice · Spiritual Lover · Minimalist Companion ·
Emotional Voyeur · Authority Conductor · Loyal Ritualist · Tender Devotee ·
Analytical Sexualist · Quiet Withdrawer

That list is `KNOWN_ARCHETYPES` in `features/report/server/archetypeSlug.ts`, which is
what the product actually uses. There are fourteen and there have been fourteen since V9.

**Three were renamed at V9** (see `docs/adr/0002-v9-archetype-renames.md`) — the scoring
maths did not change, only the display names:

| Old (V8)                | Current (V9)        |
| ----------------------- | ------------------- |
| Approval Seeker         | Tender Devotee      |
| Power Orchestrator      | Authority Conductor |
| Exhibitionist Performer | Radiant Performer   |

**Names that were never shipped.** "Erotic Adventurer", "Romantic Nurturer" and
"Logical Sexualist" appear in a Notion ideas page from December 2025 and in no product
code. Asked "what are the archetypes", the brain returned that page at rank 1 and the
rename record at rank 9, so the answer mixed retired, never-shipped and current names
into one list.

## Refunds: what happens to a customer's money and to their report

A refund is issued from the **Stripe dashboard**, not from our admin panel — there is no
refund button in the product. Stripe then sends a `charge.refunded` webhook to
`/api/stripe/webhook`, and our handler **re-locks the report**: the reader loses the
paid sections and the paywall returns. Disputes work the same way (`charge.dispute.created`
re-locks), and a dispute we win (`charge.dispute.closed` with `status=won`) restores access.

To count refunds, query the `payment` table with `query_product_data` — the analytics
rows carry revenue but not a refund count.

**The wrong answer this displaces:** a Drive file called "Refund Template", which is an
**employee expense-reimbursement form** — Employee ID, Department, Business Justification.
It held ranks 1, 2 and 4 for "how do refunds work", and nothing about customer refunds
appeared at all, so the honest reading of the brain's answer was that LoveIQ has no
customer refund path.

## How many people have taken the survey

The count of completed surveys is in the `analytics` rows, all-time and per month —
`Signups (completed surveys)`. It is also `survey_submission` in the live database.

**The wrong answer this displaces:** the figure **5,705** appears inside
`decision:2026-09-09-3d275f5327`, where it counts _individual free-text answer fields_
across all submissions — 1,432 ZIP codes, 1,429 countries, 1,401 emails, 1,390 names and
two actual free-text responses. It is not a count of people and never was. That decision
record ranked second for "how many survey responses do we have", and decision records are
the source the runbook tells readers to trust first.

## Investors, funding, board meetings, the board: we have none of these

"Board" is the name of our **Notion task board**. There is no board of directors, no
board meetings, no investors, no cap table, no funding round and no term sheet. A question
about any of those has no answer here, and the honest response is to say we have no such
record — not to return something adjacent.

**The wrong answers this displaces**, all measured 2026-09-10:

- _"who are our investors"_ → a shared spreadsheet titled "Pitchbook Investors Data",
  which is market research, plus two AQVC fundraising newsletters. Nothing in it names an
  investor in LoveIQ, because there is none.
- _"what is our funding situation"_ → LP and VC newsletters from a mailing list
  ("Not Every Fund Is Ready for LP Introductions"). Reading them as ours implies we are
  raising, or that AQVC is in a round with us. Neither is recorded anywhere.
- _"when is our next board meeting"_ → an all-day calendar hold called "Roadmap workshop".
  It is a working session, not a board meeting.
- _"what did the board say"_ → whichever task card ranked highest that day.

Task cards are titled `Notion task: …` in the index for exactly this reason; the database
is still called Board in Notion and `meta.database` still says so.

## Our privacy policy, terms of use and terms and conditions

They are **published pages, not markdown**, so their text is not in the index — only
`.md` files are ingested. The canonical source of each is the page itself:

| Document               | Page                    | Source                              |
| ---------------------- | ----------------------- | ----------------------------------- |
| Privacy Policy         | `/privacy-policy`       | `app/privacy-policy/page.tsx`       |
| Terms of Use           | `/terms-of-use`         | `app/terms-of-use/page.tsx`         |
| Terms and Conditions   | `/terms-and-conditions` | `app/terms-and-conditions/page.tsx` |
| Cookie Policy, Imprint | `/cookies`, `/imprint`  | `app/cookies/`, `app/imprint/`      |

**What each one covers**, taken from its own section headings so this page can be checked
against the source rather than trusted:

- **Privacy Policy** — Controller · Scope · Categories of Personal Data (account and
  identity, psychometric and survey, usage and technical, payment) · Purposes of
  Processing · Automated Processing and AI · Recipients of Data (infrastructure and
  hosting, payments) · and the rights and retention sections below those.
- **Terms of Use** — Purpose of LoveIQ · Eligibility · User Account · Acceptable Use ·
  Data Integrity · Reliance on Results · Content Standards · Monitoring and Enforcement ·
  Platform Changes · Termination · Liability · Governing Law.
- **Terms and Conditions** — Scope of Services · Account Registration · Contract
  Formation · Prices and Payments · Subscription Terms · User Obligations · Intellectual
  Property · Availability and Changes · Liability · Termination · Governing Law ·
  Jurisdiction.

For the processing detail behind the Privacy Policy, the indexed compliance documents are
`docs/compliance/ROPA.md` (records of processing), `LAWFUL_BASIS.md` and `DPIA.md`.

**The wrong answer this displaces:** with no first-party text in the index, "what is our
privacy policy" and "what is in our terms of service about liability" were answered with
**Vercel's** and **Google's** own policy-update emails — where the word "we" means the
vendor, not us. Measured 2026-09-10; the reader's honest conclusion was that our terms
were being revised.
