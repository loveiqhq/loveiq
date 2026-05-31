# scripts/

One-off Node.js / Python scripts for data generation and database tooling. Not part of the application bundle.

## Key Conventions

- Data-generation scripts read sources from `data/` (and `.source-artifacts/`) and write generated TypeScript back to `data/`. They are idempotent and safe to re-run.
- JS/MJS scripts use plain Node.js (no compilation). Run with `node scripts/<name>.js`. TS scripts run via `tsx`. The scoring extractor is Python stdlib (`python scripts/extract-scoring-xlsm.py`).

## File Manifest

| Script                                 | Purpose                                                                           |
| -------------------------------------- | --------------------------------------------------------------------------------- |
| `update-glossary.js`                   | Regenerate `data/glossary-data.ts` from `data/glossary-source.csv`                |
| `update-survey.js`                     | Regenerate `data/survey-data.ts` from `data/survey-source.csv`                    |
| `update-scoring-config.js`             | Regenerate `data/scoring-config.ts` from `data/scoring-config/*.csv`              |
| `extract-scoring-xlsm.py`              | Extract scoring CSVs from the source `.xlsm` workbook (`npm run scoring:extract`) |
| `update-product-kpis.js`               | Refresh generated product-KPI data from CSV inputs                                |
| `generate-practice-tendencies.js`      | Generate `data/report-practice-tendencies.ts`                                     |
| `regenerate-archetypes.js`             | Regenerate `data/report-archetypes.ts`                                            |
| `convert-report-content.js`            | Convert source report content into generated `data/report-*.ts`                   |
| `convert-summary-docx.js`              | Extract report-summary content from the source `.docx`                            |
| `generate-brand-png.js`                | Render brand PNG assets (e.g. apple-touch-icon) from SVG                          |
| `generate-seed-sql.js`                 | Generate seed SQL from source data                                                |
| `check-migrations.ts`                  | Verify migration state/consistency (`npm run check:migrations`)                   |
| `check-migration-drift.mjs`            | Detect schema divergence (`npm run check:migration-drift`)                        |
| `check-docs-truth.mjs`                 | Documentation truth gate (`npm run docs:truth`)                                   |
| `check-docs-impact.sh`                 | Blocking docs-impact PR gate (see CONTRIBUTING.md)                                |
| `rescore-submissions.ts`               | Recompute scores for existing submissions                                         |
| `delete-short-duration-submissions.ts` | Clean up abnormally short/test submissions                                        |
| `sync-stripe-promo-codes.js`           | Sync promo codes between Stripe and the database                                  |
