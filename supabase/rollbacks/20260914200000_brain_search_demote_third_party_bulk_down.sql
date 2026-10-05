-- Back to one flat penalty for all bulk mail.
-- Expect an OpenAI usage-pricing newsletter to return to the top 5 of
-- "what did we decide about pricing" — that is what this change was for.

DO $$
DECLARE
  def text;
  new_clause text := '- CASE WHEN c.source = ''gmail'' AND c.meta->>''bulk'' = ''true''
                   THEN CASE
                     WHEN (c.title || '' '' || c.body) ~* ''(^|[^@[:alnum:]._-])loveiq''
                       THEN 0.25
                     ELSE 0.55
                   END
                   ELSE 0 END';
  old_clause text := '- CASE WHEN c.source = ''gmail'' AND c.meta->>''bulk'' = ''true''
                   THEN 0.25 ELSE 0 END';
BEGIN
  SELECT pg_get_functiondef(oid) INTO def FROM pg_proc WHERE proname = 'brain_search' LIMIT 1;
  IF position(new_clause in def) = 0 THEN
    RAISE NOTICE 'split clause not present — nothing to revert';
    RETURN;
  END IF;
  EXECUTE replace(def, new_clause, old_clause);
END $$;
