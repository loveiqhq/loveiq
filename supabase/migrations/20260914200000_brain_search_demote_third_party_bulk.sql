-- Bulk mail that is NOT about us is demoted harder than bulk mail that is.
--
-- The flat -0.25 on every bulk message treated two different things as one, which is
-- why raising it had been measured and REJECTED: it demotes our own Jira ticket and
-- Google Ads' report on our own account along with the newsletter.
--
-- Measured 2026-09-14 across gmail's 8,651 chunks:
--   bulk AND about us      1,493   "[JIRA] (SCRUM-922) Redesign the Paywall + Report"
--   bulk AND not about us  1,638   "OpenAI's Shift to Usage-Based Pricing: What CFOs"
--
-- Three real failures on ordinary work questions, all inside the top 5:
--   "what did we decide about pricing" -> an OpenAI pricing newsletter   <- the defect
--   "what is our conversion rate"      -> Google Ads, about OUR ads      <- correct
--   "how does the paywall work"        -> our own JIRA ticket            <- correct
-- Only the first is wrong, and a bigger flat penalty would have demoted all three.
--
-- THE DISCRIMINATOR EXCLUDES THE ADDRESS FORM, which is the whole trick. A plain
-- `body ILIKE '%loveiq%'` is contaminated by the footer of every newsletter we receive,
-- because that footer carries the recipient's own ec@loveiq.org. Verified against the
-- OpenAI newsletter specifically: naive matching called 2 of its 4 chunks "about us",
-- while requiring the word NOT to be preceded by @ or a word character calls all 4
-- correctly. The aggregate looked fine either way — only the single document showed it.
--
-- ACCEPTED COST, named rather than hidden: a service notice about us that never spells
-- the company name ("Take action: Some of your ad creative can't be shown") is demoted
-- with the newsletters. It is a nudge, not an exclusion — the mail stays fully indexed
-- and fully searchable, and asking about ad creative still finds it.
--
-- PROVED LOAD-BEARING by reverting to the flat penalty and re-running the battery: the
-- OpenAI newsletter returned to the top 5 and bulk-not-in-top5-1 failed again. 222/222
-- with the split, 221/222 without.
--
-- Written as a substitution against pg_get_functiondef rather than a full CREATE OR
-- REPLACE, so this migration cannot silently revert an unrelated change made to
-- brain_search since. It RAISES if the clause it expects is not there verbatim.

DO $$
DECLARE
  def text;
  old_clause text := '- CASE WHEN c.source = ''gmail'' AND c.meta->>''bulk'' = ''true''
                   THEN 0.25 ELSE 0 END';
  new_clause text := '- CASE WHEN c.source = ''gmail'' AND c.meta->>''bulk'' = ''true''
                   THEN CASE
                     WHEN (c.title || '' '' || c.body) ~* ''(^|[^@[:alnum:]._-])loveiq''
                       THEN 0.25
                     ELSE 0.55
                   END
                   ELSE 0 END';
BEGIN
  SELECT pg_get_functiondef(oid) INTO def FROM pg_proc WHERE proname = 'brain_search' LIMIT 1;
  IF def IS NULL THEN
    RAISE EXCEPTION 'brain_search not found';
  END IF;
  IF position(new_clause in def) > 0 THEN
    RAISE NOTICE 'already applied';
    RETURN;
  END IF;
  IF position(old_clause in def) = 0 THEN
    RAISE EXCEPTION 'bulk penalty clause not found verbatim — refusing to guess. Re-read pg_get_functiondef and update this migration.';
  END IF;
  EXECUTE replace(def, old_clause, new_clause);
END $$;
