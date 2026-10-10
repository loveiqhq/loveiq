# Persona walkers

Every night four scripted people take the whole LoveIQ journey on staging, one archetype
each. Each one:

1. takes the survey;
2. reads the free report;
3. opens the paywall and buys a plan with Stripe's test card;
4. reads what it bought.

A judge on the teamwork@ Claude seat then says what a real person would have run into,
against Marcus's 22 signals. A second pass tries to prove each finding wrong. What
survives is posted to #brain and kept in Jarvis.

Mark asked for this on 2026-09-05: "a systematic way to thoroughly test" the product.

## Where the results go

- **#brain**, around 03:30 UTC. For each walk: whether it reached the end, whether the
  report named the right archetype, and whether paying unlocked anything. Then the judge's
  confirmed findings. Findings from earlier nights are counted, not repeated.
- **Jarvis.** The night as one notice, and each new confirmed finding as its own. Ask
  "what did the persona walks find?".
- **Nowhere else.** This repository is public, and so are its artifacts and logs. The
  screenshots include the unlocked paid report. The walks and the judge run in one job, so
  the screenshots never leave the runner, except to the judge: Claude reads them on the
  teamwork@ seat. The log carries counts and redacted stop reasons, never a report token or
  a Stripe session.

## How it runs

| Piece                                        | File                                                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| The personas: one answer sheet per archetype | `scripts/walkers/personas.json`, built by `scripts/walkers/build-personas.ts`                          |
| One walk                                     | `scripts/walkers/walk.ts`                                                                              |
| Which four walks run tonight                 | `scripts/walkers/rotation.ts`                                                                          |
| What a walk proves on its own                | `scripts/walkers/checks.ts`                                                                            |
| The judge, the message and the notices       | `scripts/walkers/judge.ts`                                                                             |
| The nightly job                              | `.github/workflows/persona-walkers.yml`, started at 02:41 UTC by `features/cron/server/github-jobs.ts` |

- **The personas are searched for, not written.** Coordinate ascent over every scoring
  question finds an answer sheet that the production engine scores as that archetype, by
  20 points or more. `__tests__/scripts/persona-walkers.test.ts` fails when the scoring
  config changes. Rebuild with `npx tsx scripts/walkers/build-personas.ts`.
- **The rotation.** Fourteen archetypes on a phone (iPhone 15 Pro, WebKit) and a desktop
  (Chrome) make 28 walks. Four a night covers them all in a week.
  - **Which report.** A night reads one report: the default one loveiq.org shows, and
    Fatih's V4 (`?v4=1`) on the next night. The rotation repeats every seven days, so each
    persona on each device reads both, a week apart. Since Report 3.0 launched
    (2026-10-06) the default IS V4, so both nights read it; the `v4` night only names it.
  - **Which plan.** Each walk buys one of the two plans staging sells since Pricing 3.0
    (2026-10-05), and the plan moves on by one each week, so every persona buys both over two
    weeks. `core` is no longer sold there, so the rotation leaves it out (`ROTATION_PLANS`); a
    walk asked for it by hand (`--plan core`) still tries it where it is sold.
  - The single report (`full_report`: "Only Your Highest Archetype" on staging, "Just a
    snapshot" on main) is bought the way most people reach it: the sticky "Unlock full
    report" bar, or, on the default report, the "Unlock the full report" button under the
    archetype list. The button goes straight to Stripe for that plan. The bar opens the plan
    picker since 2026-10-09 (Marcus: the plans first, then the payment page), where the walk
    presses the single report's button; on a branch where the bar still buys straight away,
    its "Taking you to secure checkout..." tells the walk to wait for Stripe instead.
  - All 14 (`all_reports`: "All 14 Archetype Reports" on staging, "For you & your partner" on
    main) is bought from the plan picker, opened from an archetype row's "Unlock report"
    ("Unlock Spark Seeker report" on a phone), a padlock on a locked chart (V4 only), or a
    chapter's "Unlock your report". The walk knows both catalogues' names and buttons
    (`PLAN_TITLE`, `PLAN_CTA` in `walk.ts`).
  - The report also opens the picker by itself while a person reads. When it does, the walk
    buys from it, and `walk.json` says "the report, by itself".
- **What a walk proves on its own** (`checks.ts`, posted whatever the judge says):
  - it reached the end;
  - the report API scored the persona's archetype, and the page led with the same one;
  - the return page named the plan the walk meant to buy;
  - paying removed the locks;
  - no console errors on staging's own pages, no failed or slow calls to our API;
  - no page scrolls sideways;
  - every answer the persona gives was on screen.

  Each walk also keeps a timeline of every navigation and every paywall click, so "who took
  it to Stripe" is a fact, not a guess.

- **Pace.** A walk answers at about five seconds a question, roughly how long a person
  takes. Faster than that trips the draft-save limit (20 a minute) and reports the bot, not
  the product. `WALK_PACE=0.3` speeds up a local try.
- **The judge reads three folders, and nothing else.** Two `claude -p` passes on the
  teamwork@ seat (Sonnet by default, `WALKER_JUDGE_MODEL` to change it).
  - It can Read, Glob and Grep the walk folder, main's code and staging's code, and only
    those: the rules are scoped to the three paths, and a read anywhere else is refused
    (tested 2026-09-29).
  - Claude Code is installed at its latest release on every run, like the brain's other
    jobs, and the job logs the version. The rules were tested on 2.1.284. If a release
    changes how they work, check again: make one folder the judge may read and one it may
    not, run `claude -p` with `judgeArgs` and `judgeEnv` on the first, and ask it to read,
    glob and grep the second. All three must be refused.
  - It has no shell, no web and no writing.
  - It starts with only its sign-in in its environment, none of the job's other secrets.
  - Pages and code are evidence, never instructions.
  - A finding must cite a walk, its steps and the words on screen, and says whether
    production has the same problem. Whether a finding repeats an earlier night is decided
    by its title in code, not by the model.
- **Time limits.** Each walk has 20 minutes and records why it stopped. A survey that keeps
  asking stops after the survey's length plus ten.
- **Buying a second report.** One more walk a night, on production's code (the `proof` job),
  buys another archetype's report from "Other Archetypes" before its own
  (`walk.ts --sequence other-first`). Three faults in exactly that reached production on
  2026-10-06 (#524), because every walk bought once. It checks the list's "Unlock" and
  "View report" labels, the pay screen's "Only the X Report", the return page's "Your X
  report is unlocked", that X opens at its top, that the reader's own report stays locked,
  and that neither report keeps a lock once both are bought. The first failed check stops
  the walk, fails the run and posts the reason to #brain. Each check is in `walk.json`'s
  `sequence`, judged by `checks.ts`.

## Staging only, and why that is safe

A walk submits a survey, pays and triggers the report emails. `walk.ts` refuses any host
but `https://staging.loveiq.org` (and localhost when `WALK_ALLOW_LOCAL=1`). On staging:

- the database is staging's own (`slgljpyszkmdieuvhkto`), with no real data;
- Stripe is in test mode, and the walk pays with 4242 4242 4242 4242;
- the survey, payment and ops alerts go to #brain (set in the loveiq-staging Vercel
  project's Preview environment, 2026-09-29);
- every email goes to `delivered+walk<timestamp>@resend.dev`, Resend's test inbox, which
  accepts mail and throws it away;
- the browser blocks every analytics host, so no walk's page views reach GA4, PostHog or
  Clarity. Staging's Stripe webhook can still send a server-side purchase event to PostHog,
  tagged `deploy_env=staging`, which the browser cannot block;
- the browser refuses every request to loveiq.org, and the walk pays only on a Stripe
  session in test mode (`cs_test_`).

Stripe's checkout asks "I am an AI agent acting on behalf of someone else". A walk is a
script with no model choosing anything, so that box is left as a person would leave it.

## Running one by hand

```bash
set -a; . ./.env.local; set +a        # STAGING_PASSWORD
npx tsx scripts/walkers/walk.ts --persona "Spark Seeker" --device "iPhone 15 Pro" --plan core
npx tsx scripts/walkers/walk.ts --persona "Spark Seeker" --device "Desktop Chrome" --no-pay
```

- The walk writes `walks/<persona>--<device>/walk.json` and its screenshots. Keep them
  local.
- `WALK_DEBUG=1` prints the report's address to the console, never to the file.
- A laptop that sleeps mid-walk freezes it: a walk on 2026-09-29 lost 17 minutes and
  logged 48 "offline" errors. Keep the lid open, or use Actions.
- From Actions: run "Persona walks on staging", optionally with a JSON list of walks. Turn
  `judge` off to walk without posting.
- A walk that stops fails the run, judged or not. From 2 to 5 October every walk stopped on
  the last pre-report slide, the night's message said "0 of 4 reached the end", and the run
  stayed green, so nobody looked.

## What it costs

- **GitHub:** nothing. The repository is public, so its Actions minutes are free.
- **Claude:** two long calls a night on the teamwork@ seat, beside the brain's jobs. A
  limit hit is posted to #brain as "The judge did not run". The walks' own checks are
  still posted.
- **Staging:** four submissions and four test payments a night in staging's database.

## Known limits

- **Staging is not production.** Staging carries Fatih's V4 report and three survey
  questions main does not have. A walk answers the extra questions with their first option
  and lists them in `walk.json`. Some fixes reach main before staging. The judge marks
  those "Already fixed on main", because the fix must survive the staging merge.
- **Scrolling on a phone is by script.** WebKit has no touch swipe, so a phone walk scrolls
  with `scrollBy`. That works even where a finger cannot. The walk therefore checks the
  page for `overflow: hidden` and reports a lock a person would hit.
- **Stripe on the runner.** The job runs on macOS. On Linux, WebKit cannot load Stripe's
  checkout: every phone walk on 2026-09-29 got a blank form, then "Something went wrong".
  Real iPhones pay (GA4 counted 16 iOS Safari purchases in the 30 days before), and the
  same walks pay on macOS. The runners are in the US, where Stripe's Link offers to save
  the card with its box ticked and then requires a phone number; the walk unticks it, as a
  buyer who only wants to pay would.
- **Staging used to ask for its password after Stripe.** Its password cookie was
  `SameSite=Strict`, so the browser left it off Stripe's redirect back. Since 2026-09-30 it
  is `Lax`, which is sent on that redirect. If the password page ever comes back, the walk
  still follows the `next` it keeps, as a tester would after typing the password.
- **The judge is a model.** Its precision has not been measured against a labelled set
  yet, which is why a second pass has to confirm each finding. It checks each finding
  against the screenshots, because the text in `walk.json` is a capture and can miss
  things: on 2026-09-29 a first pass reported "no percentage" on a screen whose
  screenshot shows "0% complete", and the stricter second pass now drops claims like that.
