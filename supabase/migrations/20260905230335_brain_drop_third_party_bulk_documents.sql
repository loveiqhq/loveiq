-- Removes the 5,636 chunks that fifteen third-party Drive documents contributed to
-- the company brain: one investor data export (3,242 chunks, 10.5% of the entire
-- corpus, from a spreadsheet) and fourteen books at ~170 parts each.
--
-- WHY, MEASURED. Only 16.6% of the corpus was anything LoveIQ knows about itself.
-- These documents are not inert ballast: a 2,400-character book page matches
-- almost any vocabulary, so they surface as confident, correctly-cited answers to
-- questions they cannot answer. A nonsense query returned the investor export as
-- hit 2 of 6, formatted identically to a real answer.
--
-- WHY AN EXPLICIT ID LIST. The obvious rule -- "drop the big PDFs" -- also deletes
-- the fourteen `LoveIQ_*_Preview.pdf` files, which are 58-60 parts each of our OWN
-- product and the only chunks that can say what a given archetype's report
-- contains, plus the PhD thesis and research papers that source user-facing copy.
-- No size, extension or folder test separates those from a trade paperback.
-- The academic sources are KEPT, deliberately (decision 2026-09-06).
--
-- Matching on FILE ID, not on title, matters for the same reason in the other
-- direction: the corpus also holds the team's OWN written summary
-- ("The Ethical Slut-Easton & Hardy-Summary.md", 11 parts), Notion "Literature:"
-- board records, and email threads naming these books. All first-party, all kept.
-- A title match would have taken every one of them.
--
-- ORDER MATTERS AND THIS IS THE SECOND STEP. `SKIP_FILE_IDS` in
-- features/brain/server/ingest/drive.ts shipped first (72fbf004). Deleting before
-- that skip is live means the next drive run re-fetches and re-embeds all 5,636.
--
-- Not done through the sweep: `shouldSweep` gates drive to once per 20 hours and
-- requires a complete walk, which drive frequently does not achieve. A DELETE is
-- deterministic. Re-running this is a no-op.

DELETE FROM public.brain_chunk
 WHERE source = 'drive'
   AND split_part(source_id, '#', 1) IN (
     'doc:1CK4rTwWyL9NPDrGNTTzy2-ElZGBuZ9PFh4eWa58b-2M', -- Pitchbook Investors Data (3,242)
     'doc:1IM31OqVpLOl9Rs7Z3ndixKWeYqHX2xkp',            -- The 15 Commitments of Conscious Leadership
     'doc:1l98gvhLBXhbFf5wq3plctq7V9n-2Jx9z',            -- Come As You Are
     'doc:1RwRoB-igQqsvzE6LHno97G8WwqynTy6S',            -- The 7 Habits of Highly Effective People
     'doc:1hnM-VS1B3BAe3LHFRviEsAPRMdi3j_2z',            -- The Psychology of Human Sexuality
     'doc:1qYkpYT1qCsDVK9RLM6vFh-hYctVWa02E',            -- Magnificent Sex
     'doc:1NhDPQYzkYIqpJU3ltCnM_rK0sq3xyjSl',            -- Erotism
     'doc:1WDJ-weS-2WKa_I2oqhjGrMDpJ7jvT9mU',            -- Womens Anatomy of Arousal
     'doc:1gR4xfkr6TyPRaz0Io2m-Wf7BwufnEnx-',            -- Methods of Persuasion
     'doc:1rz74juprM1AaD6uYQGtFaATisFeiLLRA',            -- Why We Love
     'doc:13DIy7VHqC9kRej_u2Cz2esDS8AmdGD79',            -- Mating in Captivity
     'doc:1FoZvl6x7jp5Wlcik9XKfYJeXvX_Ifixt',            -- The Ethical Slut
     'doc:1bfIb9WMlptdXDXnmp551QycCI7hYlg8x',            -- The Hite Report
     'doc:1VE2ia5QOxvnXXrvP4qxWyKU1bigkFdgu',            -- Sex at Dawn
     'doc:1aSbmxqaOOmgX82AAanW-yQfC6kTBdnPp'             -- Bonk
   );
