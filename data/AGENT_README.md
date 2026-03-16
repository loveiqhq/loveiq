# data/

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

## File Manifest

| File                  | Purpose                                | Regenerate With                         |
| --------------------- | -------------------------------------- | --------------------------------------- |
| `glossary-data.ts`    | Auto-generated glossary terms (~688KB) | `node scripts/update-glossary.js`       |
| `glossary-source.csv` | Source CSV for glossary                | — (hand-edit, then regenerate)          |
| `survey-data.ts`      | Survey questions and structure         | `node scripts/update-survey.js`         |
| `survey-source.csv`   | Source CSV for survey questions        | — (hand-edit, then regenerate)          |
| `countries.ts`        | Country list for survey forms          | — (hand-maintained)                     |
| `scoring-config.ts`   | Compiled scoring config                | `node scripts/update-scoring-config.js` |
| `scoring-config/`     | 12 source CSVs for archetype scoring   | — (hand-edit, then regenerate)          |
