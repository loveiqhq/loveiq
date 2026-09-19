-- Down for 20260905230335_brain_drop_third_party_bulk_documents.
--
-- THERE IS NO SQL DOWN FOR THIS. The migration deleted rows; the text lived only
-- in `brain_chunk` and in the Drive files it was extracted from. Nothing here can
-- reconstruct it, and a down-migration that silently restores nothing is worse
-- than one that says so.
--
-- TO ACTUALLY REVERSE IT: remove the offending ids from `SKIP_FILE_IDS` in
-- features/brain/server/ingest/drive.ts, deploy, and let the next `brain-drive`
-- run re-fetch and re-chunk them from Drive. Budget for the re-embedding: 5,636
-- chunks at the ingester's own pace, which is several runs, not one.
--
-- The source documents themselves were never touched. They are still in Drive.

SELECT 'no-op: see the comment above -- reverse this by editing SKIP_FILE_IDS and re-ingesting' AS note;
