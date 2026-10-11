# Team data export

Every customer and product table in the production database, as one CSV per table, with what
identifies a person masked, in a Google Drive folder that only the team can open. The team uses
it to explore the data, for example in Marcus's survey explorer.

**Decision (Eman, 2026-10-11):** "mask the emails and names and those sensitive info". This
replaces the unmasked copy decided on 2026-10-10. Every refresh replaces each file and deletes
its older versions, so the first masked copy removes the unmasked one from Drive. Only the team
(Eman, Marcus, Mark, Fatih, Sanjin and Ajna) can open it. Recorded as risk R3.8 in
[`docs/compliance/DPIA.md`](../compliance/DPIA.md).

## Where it is

- The Drive folder **"LoveIQ team data (production export, team only)"**, owned by Eman's
  `ec@` account.
- The other five are **editors**: they can open, download, add, rename and delete files in it.
  They cannot share the folder or any file in it with anyone, and there is no link sharing.
  Every refresh sets each file so that only the owner can share it: a folder's own setting
  does not reach its files, and until 2026-10-11 every file let editors share it.
- The folder carries a Drive property, `loveiq_team_export=production`, which the server finds
  it by, so renaming or moving the folder is safe. To use another folder, set the tag on the new
  one and remove it from the old one, as `ec@`: a Drive `files.update` with
  `{"properties": {"loveiq_team_export": "production"}}` (or `null` to remove it). The server
  writes only to a tagged folder `ec@` owns, and stops if there is not exactly one.
- Every exported file also carries its own Drive property, `loveiq_team_export_file=production`.
- **Jarvis never indexes it.** Its Drive walk skips every file under the tagged folder at any
  depth (whoever owns it) and any file carrying the per-file property, wherever it is moved.
  If the folder cannot be checked, that hour's walk stops instead (`team-export-check-failed`).
  From 10 to 11 Oct 2026 the walk did index the export (37,881 chunks); removing those from
  the index awaits Eman's go, because Jarvis's own sweep will not delete most of a source.
- To add or remove a person, the owner changes the folder's sharing. Nothing in code holds the
  list.
- The README in the folder lists every file, its row count and when it was made.

## What is in it, and what is not

- **In it:** every table and materialized view in the `public` schema, every row, every column.
- **Masked** (`maskRow` in `features/admin/server/team-export.ts`):
  - every email address, wherever it appears, reads `masked-` and a 12-character code. The same
    address has the same code in every file of one copy, so tables still join on it. The key is
    new for every copy and never kept, so a code cannot be worked back to an address, and codes
    change between copies;
  - names, birthdays, IP addresses, report links and access tokens, card digits and expiry,
    Stripe receipt links, promo codes, messages to a partner, PostHog and Hotjar session ids
    (their recordings show the person) and admins' searches read `[masked]`;
  - so do the answers to the email, name and ZIP or postcode questions (`00000`, `00001`,
    `15002`), in submissions and in drafts, and the history of answer edits;
  - and the raw Stripe and Calendly payloads, which repeat all of the above.
  - If the survey's email, name or postcode question cannot be found, the export stops and
    writes nothing, rather than copy those answers unmasked.
- **Kept:** every answer, including the two open questions as people typed them (any email
  address or report link in the text masked; a name someone typed into it can remain),
  demographics, archetypes and scores, payments (amounts, plans, dates), events, and the
  internal ids that join the tables.
- `survey_submission` and `survey_partial_save` gain `is_likely_test` and `test_reasons`. They
  flag staff emails and runs too fast to be real, using the admin panel's rule.
- **Not in it:**
  - `brain_*`, Jarvis's index of the company's own email, Slack, WhatsApp and documents
    (everyone can search it through Jarvis already);
  - job and alert plumbing: `cron_run`, `rate_limits`, `system_flags`, `slack_*`;
  - `data_subject_request_log`: copying the list of people who asked to be deleted would
    defeat their request;
- It is read table by table over a few minutes, not as one snapshot. A row written meanwhile
  can be in one file and not in its partner.

## Refreshing it

**Ask Claude** ("export all the data", "refresh the team data"). Jarvis's `export_all_data`
starts the export on the server (`/api/cron/team-export`, production only) and replies with the
folder's link, who can open it and who owns it; nobody's laptop is needed, and the data goes
from the database to Drive without passing through the chat. Only the owner can add someone,
since editors cannot share the folder on, so the reply names the owner as the person to ask.

- It takes a few minutes. To see whether it has finished, or how the last one went, ask Claude;
  it uses `export_status`, which changes nothing.
- One runs at a time on the server. Asking again after one has finished starts another copy, so
  a refresh after a deletion request always runs. If one is already running when someone is
  deleted, start another once it finishes: the running one may have read them first.
- Every run is recorded in Redis when it starts and when it ends, so a check reports a run the
  server killed as one that never finished. A failed run alerts #prod-alerts and records
  `error` or `timeout` in `cron_run`; a check, or the next start, says why it failed.
- Anyone who can use Jarvis can start a refresh. That changes how fresh the copy is, not who can
  open it.

Before writing anything, both ways check the folder and every file a run will replace: owned
by `ec@`, open only to individual loveiq.org accounts (no link, whole-domain or group sharing,
since Drive does not list a group's members), and the folder's editors unable to share it on.
If any check fails, nothing is written and the error names the file and the reason. A request
that fails part-way through the upload leaves the files before it refreshed and the README
older than them; the next run completes it.

**From a laptop**, run it from a checkout of `main` on a machine that has:

- the production `.env.local`, with `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and
  `GOOGLE_IMPERSONATE_SERVICE_ACCOUNT`;
- a fresh Google login: `gcloud auth application-default login`.

```bash
npx tsx --env-file=.env.local scripts/team-data-export.ts \
  --out ~/team-data-export --drive-folder <the folder's id, from its Drive address>
rm -rf ~/team-data-export
```

- It takes no lock: do not run it while the server's export runs (ask Claude to check first).
- It refuses an `--out` inside any git repository, so the data cannot be committed by accident.
- The local copy is readable only by you (folder 700, files 600). Delete it once uploaded.
- Each CSV replaces the Drive file of the same name, so links to the files keep working. Files
  of a table that no longer exists stay in the folder until someone deletes them. A team
  member's own file saved under a table's name is overwritten by the next refresh.
- If a run fails part-way, run it again. The README is uploaded last, so its date is never
  newer than the files.

## When someone restricts processing

While anyone has `app_user.processing_restricted_at` set (GDPR Art. 18), the export does not run.
It stops before writing anything and says how many people are restricted.

- No filter could promise to leave such a person out. Their details also sit in payloads, URLs
  and free text, in more encodings than a matcher decodes, and each matcher tried here had a
  way past it.
- What to do:
  - If they asked to be erased, erase them (below), then refresh.
  - Otherwise, decide with Eman before the next refresh.
- Nobody had restricted processing on 2026-10-10, and there is no admin screen that sets it.

## After a deletion request

Erasing a person in the database (`/api/admin/data-subject`, action=delete) does not reach this
folder. **Refresh the export the same day**, so the Drive copy drops them too. Copies a team
member downloaded are outside our reach: ask the team to delete theirs.
