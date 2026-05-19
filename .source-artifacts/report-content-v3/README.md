# Report content V3 (2026-05-19 drop)

Source artifacts for the V3 / V9 content refresh delivered on 2026-05-19. Branch: `staging`.

This folder is a **mirror** of the docx/csv used to regenerate `data/report-*.ts` and `data/survey-data.ts`. The conversion scripts read from repo root, not from here.

## Layout

- `survey-v3.csv` — survey source CSV (10 columns: `QID,CID,Category & chapter,Question,Answer format,Answer format guidance,Info and guidance,Answer options,1-7 Explanations,How this answer will be used`). Pipeline copy lives at `data/survey-source.csv`.
- `General Report Template.docx` — main report template defining section structure + general/educational prose. Pipeline copy lives at repo root as `[WIP - MAIN] Report Template - General.docx` (filename hardcoded in `scripts/convert-report-content.js`).
- `32 - Recommendations.docx` — section 32 (delivered separately, not inside the zip). Pipeline copy lives at repo root with the same filename.
- `by-section/` — 23 per-section docx (sections 3, 5, 8–19, 21–24, 27–31), each containing 14 per-archetype subsections inside. This is the format consumed by `scripts/convert-report-content.js`. Pipeline copies live at repo root.
- `by-archetype/` — 14 per-archetype docx (`01_Sensual_Connector.docx` … `14_Quiet_Withdrawer.docx`). **Archived only** — not consumed by any current script. Kept here for cross-validation / future use.

## Pipeline

1. Survey: `data/survey-source.csv` → `node scripts/update-survey.js` → `data/survey-data.ts`
2. Report: repo-root docx → `node scripts/convert-report-content.js` → `data/report-general.ts` + `data/report-archetypes.ts`
3. Scoring: `.source-artifacts/scoring-v9/Scoring_Workbook_v9.xlsm` → `npm run scoring:update` → `data/scoring-config.ts`

## Notes

- The zip-delivered `11 - Typical Beliefs_.docx` (trailing underscore) is renamed during repo-root copy to `11 - Typical Beliefs.docx` to match `BLOCK_FILE_MAP`.
- The repo-root filenames retain the original quirky names so the pipeline keeps working with a hardcoded map. Cleaner mirror filenames live here.
