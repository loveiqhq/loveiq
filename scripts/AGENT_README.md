# scripts/

One-off Node.js scripts for data generation and database tooling. Not part of the application bundle.

## Key Conventions

- All data-generation scripts read CSV sources from `data/` and write TypeScript files back to `data/`. They are idempotent and safe to re-run.
- Scripts use plain Node.js (no TypeScript compilation required). Run with `node scripts/<name>.js`.

## File Manifest

| Script                     | Input                       | Output                   | Purpose                          |
| -------------------------- | --------------------------- | ------------------------ | -------------------------------- |
| `update-glossary.js`       | `data/glossary-source.csv`  | `data/glossary-data.ts`  | Regenerate glossary terms        |
| `update-survey.js`         | `data/survey-source.csv`    | `data/survey-data.ts`    | Regenerate survey questions      |
| `update-scoring-config.js` | `data/scoring-config/*.csv` | `data/scoring-config.ts` | Regenerate scoring engine config |
