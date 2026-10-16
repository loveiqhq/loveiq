-- One copy of a Drive file in search, not every copy someone saved.
--
-- A new version of a Drive file is often saved as a NEW file under the same name, and
-- `brain_search` returned every copy, so an answer could quote a stale one. Measured on
-- production 2026-10-16: 29 groups of drive files share an owner and a name once
-- " (part N of M)" is stripped. Among them: three "LoveIQ_Grants_Workbook" (created 12, 13
-- and 13 Oct, last edited 12, 13 and 15 Oct), three "ShowUp_ConceptPaper", four
-- "cto-cofounder-profile-loveiq.md", and two of each of the 14 archetype chapter files.
--
-- The per-document dedup still runs first and still picks each copy's part (summary before
-- transcript, then score). Then copies with the same owner and the same name collapse to
-- the most recently edited one (`meta.edited`, else `period_end`). Every other row is a
-- partition of its own, so nothing else can move: an older copy leaves, and the next result
-- comes up.
--
-- NOT collapsed, on purpose:
--   * across owners or sources: two people's files with one name are two documents
--     ("5558847237.pdf" is two copies for one owner and a third for another);
--   * a name that says nothing about the content: "Untitled document" is eight different
--     files across four owners, and a "Copy of" is a fork that may have diverged. Google's
--     German defaults ("Unbenanntes Dokument", "Kopie von") count the same;
--   * a row with no owner (120 drive chunks): there is nothing to match on.
--
-- Substituted against the LIVE definition, refusing rather than guessing if the anchor has
-- moved, and a no-op when the stage is already there. Signature, return type, STABLE,
-- search_path and grants are untouched: CREATE OR REPLACE keeps the owner and the ACL.
DO $mig$
DECLARE
  def text;
  anchor CONSTANT text := $old$  ranked AS (
    SELECT d.*, row_number() OVER (
             PARTITION BY d.source, coalesce(d.meta->>'grain','')
             ORDER BY d.score DESC, d.period_end DESC NULLS LAST) AS rn_in_bucket
      FROM deduped d WHERE d.rn_in_doc = 1
  )$old$;
  replacement CONSTANT text := $new$  -- ONE COPY OF A FILE, not every copy someone saved.
  --
  -- A new version of a Drive file is often saved as a new FILE with the same name, and
  -- every copy came back, so an answer could quote a stale version. Measured 2026-10-16:
  -- 29 groups, three "LoveIQ_Grants_Workbook" (edited 12, 13 and 15 Oct) among them.
  -- `deduped` has already picked each copy's part; this keeps the most recently edited
  -- copy of each owner's file name.
  --
  -- Never across owners or sources, and never for a name that says nothing about its
  -- content: "Untitled document" is eight different files, and a "Copy of" is a fork that
  -- may have diverged. Every other row is a partition of its own (its id), so nothing
  -- else moves: an older copy leaves and the next result comes up.
  --
  -- `edited` is the Drive API's RFC 3339 UTC stamp on every drive row, so as text it
  -- sorts in time order, and no cast can fail in the middle of a search.
  copies AS (
    SELECT d.*, row_number() OVER (
             PARTITION BY CASE
               WHEN d.source = 'drive' AND d.meta->>'owner' IS NOT NULL
                AND d.title !~* '^(drive|meeting notes): (untitled|unbenannt|copy of |kopie von )'
               THEN d.meta->>'owner' || ' ' || regexp_replace(d.title, ' \(part \d+ of \d+\)$', '')
               ELSE d.id::text END
             ORDER BY coalesce(d.meta->>'edited', d.period_end::text) DESC NULLS LAST,
                      (coalesce(d.meta->>'section','') = 'transcript') ASC,
                      d.score DESC) AS rn_in_copy
      FROM deduped d WHERE d.rn_in_doc = 1
  ),
  ranked AS (
    SELECT d.*, row_number() OVER (
             PARTITION BY d.source, coalesce(d.meta->>'grain','')
             ORDER BY d.score DESC, d.period_end DESC NULLS LAST) AS rn_in_bucket
      FROM copies d WHERE d.rn_in_copy = 1
  )$new$;
  found integer;
BEGIN
  -- STRICT: exactly one brain_search, or this refuses. A second overload is the
  -- "is not unique" outage of 2026-08-30, and editing one of two would hide it.
  SELECT pg_get_functiondef(p.oid) INTO STRICT def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'brain_search';
  IF position('rn_in_copy' in def) = 0 THEN
    found := (length(def) - length(replace(def, anchor, ''))) / length(anchor);
    IF found <> 1 THEN
      RAISE EXCEPTION 'expected the ranked stage once in brain_search, found % — refusing', found;
    END IF;
    EXECUTE replace(def, anchor, replacement);
  END IF;
END
$mig$;
