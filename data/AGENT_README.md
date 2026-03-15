# data/

> For the full file listing, see the **Repo Map** in [CLAUDE.md](../CLAUDE.md).

## Purpose

Static data assets (large generated TypeScript files and their source CSVs) consumed by the application at build time and runtime.

## Key Conventions

- **Auto-generated files must NOT be hand-edited.** Regenerate from their CSV sources using the scripts below:

```bash
node scripts/update-glossary.js          # glossary-source.csv -> glossary-data.ts
node scripts/update-survey.js            # survey-source.csv -> survey-data.ts
node scripts/update-scoring-config.js    # scoring-config/*.csv -> scoring-config.ts
```

- `countries.ts` is the only hand-maintained file in this directory.
- `scoring-config/` contains the CSV source files for the scoring engine. To add or modify scoring rules, edit the CSVs and regenerate.
