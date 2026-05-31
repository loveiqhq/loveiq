Versioned source artifacts for the V9 scoring sync.

Files in this folder are the human-authored workbook used to derive the scoring configuration changes implemented in code. They are kept out of the repo root to avoid clutter and are not read by the app at runtime.

- `Scoring_Workbook_v9.xlsm` — authoritative 18-tab workbook (16 data sheets + `README` + `changelog`). Extract CSVs into `data/scoring-config/` via `scripts/extract-scoring-xlsm.py`. The extract script skips the two non-data sheets.

V9 is a configuration refresh on top of the existing V4+V5 engine. No engine code changes; `engine_version` stays `"v4+v5"`. See the `changelog` tab inside the workbook for the authoritative list of changes; summary:

- `config_version` bump v6 → v9 (stamp only).
- Q01003 retired — 24 categorical_boost rules removed.
- Q16003 retired — overlay `OVL_CHANGE_EFFICACY` removed (was unreferenced).
- Q16004 retired — overlay `OVL_START_HORIZON` and 7 categorical_map rows removed.
- Q16005 — 6 new categorical_boost rules added to recover the Q01003 separation signal.
- Q16015 added — marketing opt-in question, not scored. Captured generically in survey submission; downstream Resend audience wiring is a separate task.
- Wording refresh on `questions` + `categorical_boost_rules` labels (no formula impact).
- `prototype_helpers` rewritten XLOOKUP → INDEX/MATCH (portability fix only).
- Dimension weights cast to numeric (bug fix for SUM and anchor downstream).
- **Archetype renames** (not in changelog but present in the workbook):
  - `Approval Seeker` → `Tender Devotee`
  - `Power Orchestrator` → `Authority Conductor`
  - `Exhibitionist Performer` → `Radiant Performer`
    Same bias values, prototype values, gates — display-name change only. Existing DB rows are migrated in `supabase/migrations/20260514120000_v9_archetype_renames.sql`. Old report URLs continue to resolve via the legacy slug alias in `features/report/server/archetypeSlug.ts`.

Row-count deltas (V8 → V9):

| Sheet                   | V8  | V9                 |
| ----------------------- | --- | ------------------ |
| categorical_boost_rules | 310 | 292                |
| overlays                | 25  | 23                 |
| categorical_map         | 40  | 33                 |
| questions               | 61  | 59                 |
| question_logic          | 9   | 14                 |
| sheet_info              | 0   | 70 (docs reformat) |

Unchanged: gates (12), weight_modifiers (19), archetype_calibration (14), prototype_helpers (294), archetype_prototypes (294), dimensions (21), archetype_bias (14), model_params (48), independent_params (37), enum_map (12).

Prior V7 and V8 artifacts remain in `.source-artifacts/scoring-v7/` and `.source-artifacts/scoring-v8/` for historical reference.
