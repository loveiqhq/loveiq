Versioned source artifacts for the V8 scoring sync.

Files in this folder are the human-authored workbook and migration notes used to derive the scoring configuration changes implemented in code. They are kept out of the repo root to avoid clutter and are not read by the app at runtime.

- `Scoring Config - Identify Your Sexual Archetype V8.xlsm` — authoritative 16-tab workbook. Extract CSVs into `data/scoring-config/` via `scripts/extract-scoring-xlsm.py`.
- `V7_to_V8_Migration_Guide.docx` — rationale and breakdown of every change from V7 to V8 (sheet renames, categorical_boost_rules schema reduction, gate retuning, per-archetype calibration, prototype flip).

The prior V7 artifacts remain in `.source-artifacts/scoring-v7/` for historical reference.
