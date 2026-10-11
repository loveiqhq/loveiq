# Team data export

Every customer and product table in the production database, as one CSV per table, in a Google
Drive folder that only the team can open. The team uses it to explore the data freely, for
example in Marcus's survey explorer.

**Decision (Eman, 2026-10-10):** the team gets all of it, unmasked, and nobody else gets any of
it. "The team" is Eman, Marcus, Mark, Fatih, Sanjin and Ajna. Recorded as risk R3.8 in
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
- To add or remove a person, the owner changes the folder's sharing. Nothing in code holds the
  list.
- The README in the folder lists every file, its row count and when it was made.

## What is in it, and what is not

- **In it:** every table and materialized view in the `public` schema. Nothing in it is masked
  or removed: emails, names, free-text answers, report links and payment details are all there.
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
folder's link; nobody's laptop is needed, and the data goes from the database to Drive without
passing through the chat.

- It takes about three minutes. Asking again says whether it is still running or finished.
- One runs at a time, and a copy under ten minutes old is reused rather than made again.
- A failed run alerts #prod-alerts and records `error` in `cron_run`; the next ask says why it
  failed, and starts a new one.
- Anyone who can use Jarvis can start a refresh. That changes how fresh the copy is, not who can
  open it.

Before writing anything, both ways check the folder is still team-only: owned by `ec@`, shared
with loveiq.org people only, no link or whole-domain sharing, and editors unable to share it on.
If any of that has changed, nothing is written and the error says what.

**From a laptop**, run it from a checkout of `main` on a machine that has:

- the production `.env.local`, with `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and
  `GOOGLE_IMPERSONATE_SERVICE_ACCOUNT`;
- a fresh Google login: `gcloud auth application-default login`.

```bash
npx tsx --env-file=.env.local scripts/team-data-export.ts \
  --out ~/team-data-export --drive-folder <the folder's id, from its Drive address>
rm -rf ~/team-data-export
```

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
