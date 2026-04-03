const fs = require("fs");
const path = require("path");
const { parse } = require("csv-parse/sync");

// ─── Paths ─────────────────────────────────────────────────────────────────────
const configDir = path.join(__dirname, "..", "data", "scoring-config");
const tsPath = path.join(__dirname, "..", "data", "scoring-config.ts");

// ─── Helpers ────────────────────────────────────────────────────────────────────
function readCsv(filename) {
  const filePath = path.join(configDir, filename);
  const content = fs.readFileSync(filePath, "utf-8");
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    relax_quotes: true,
    bom: true,
  });
}

function toFloat(v, def = 0) {
  if (v == null || v === "") return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function toBool(v) {
  return ["true", "1", "yes", "y", "t"].includes(String(v).trim().toLowerCase());
}

function normalizeLabel(label) {
  return String(label || "")
    .trim()
    .toLowerCase()
    .replace(/\u201C|\u201D/g, '"') // smart quotes
    .replace(/\u2018|\u2019/g, "'") // smart apostrophes
    .replace(/\u2013|\u2014/g, "-") // em/en dashes
    .replace(/\s+/g, " ");
}

// ─── Parse all CSVs ─────────────────────────────────────────────────────────────
function main() {
  // 1. Model params → key-value object
  const modelParamsRows = readCsv("model_params.csv");
  const modelParams = {};
  for (const row of modelParamsRows) {
    const key = (row.key || "").trim();
    if (!key) continue;
    modelParams[key] = (row.value || "").trim();
  }

  // 2. Dimensions
  const dimensionsRows = readCsv("dimensions.csv");
  const dimensions = dimensionsRows
    .filter((r) => r.dimension_id)
    .map((r) => ({
      id: r.dimension_id.trim(),
      name: (r.dimension_name || "").trim(),
      qid: (r.source_question_id || "").trim(),
      transform: (r.transform || "").trim(),
      defaultWeight: toFloat(r.default_weight, 1.0),
    }));

  // 3. Overlays
  const overlaysRows = readCsv("overlays.csv");
  const overlays = overlaysRows
    .filter((r) => r.overlay_id)
    .map((r) => ({
      id: r.overlay_id.trim(),
      name: (r.overlay_name || "").trim(),
      qid: (r.source_question_id || "").trim(),
      transform: (r.transform || "").trim(),
    }));

  // 4. Archetype prototypes (14 archetypes × ~19 dimensions)
  const protoRows = readCsv("archetype_prototypes.csv");
  const archetypePrototypes = protoRows
    .filter((r) => r.archetype_name && r.dimension_id)
    .map((r) => ({
      archetypeId: parseInt(r.archetype_id, 10),
      archetypeName: r.archetype_name.trim(),
      dimensionId: r.dimension_id.trim(),
      prototypeValue: toFloat(r.prototype_value, 0.5),
    }));

  // 5. Archetype bias
  const biasRows = readCsv("archetype_bias.csv");
  const archetypeBias = biasRows
    .filter((r) => r.archetype_name)
    .map((r) => ({
      archetypeName: r.archetype_name.trim(),
      biasAddToRawScore: toFloat(r.bias_add_to_raw_score, 0.0),
    }));

  // 6. Categorical boost rules
  const boostRows = readCsv("categorical_boost_rules.csv");
  const categoricalBoostRules = boostRows
    .filter((r) => r.question_id && r.answer_code && r.archetype_name)
    .map((r) => ({
      questionId: (r.question_id || "").trim(),
      answerCode: (r.answer_code || "").trim(),
      answerLabel: (r.answer_label || "").trim(),
      archetypeName: r.archetype_name.trim(),
      scoreAdd: toFloat(r.score_add, 0.0),
    }));

  // 7. Gates
  const gateRows = readCsv("gates.csv");
  const gates = gateRows
    .filter((r) => r.archetype_name && r.dimension_id)
    .map((r) => ({
      archetypeName: r.archetype_name.trim(),
      dimensionId: r.dimension_id.trim(),
      operator: (r.operator || "").trim(),
      value: toFloat(r.value, 0.0),
      scoreAdjustmentIfFail: toFloat(r.score_adjustment_if_fail, 0.0),
    }));

  // 8. Categorical map (dim/ovl → answer_code → numeric_value)
  const catMapRows = readCsv("categorical_map.csv");
  const categoricalMap = catMapRows
    .filter((r) => r.dim_ovl_id && r.answer_code)
    .map((r) => ({
      dimOvlId: r.dim_ovl_id.trim(),
      questionId: (r.question_id || "").trim(),
      answerCode: r.answer_code.trim(),
      answerLabel: (r.answer_label || "").trim(),
      numericValue: toFloat(r.numeric_value, 0.5),
    }));

  // 9. Enum map
  const enumRows = readCsv("enum_map.csv");
  const enumMap = enumRows
    .filter((r) => r.dim_ovl_id && r.answer_code)
    .map((r) => ({
      dimOvlId: r.dim_ovl_id.trim(),
      questionId: (r.question_id || "").trim(),
      answerCode: r.answer_code.trim(),
      answerLabel: (r.answer_label || "").trim(),
    }));

  // 10. Weight modifiers
  const wmRows = readCsv("weight_modifiers.csv");
  const weightModifiers = wmRows
    .filter((r) => r.overlay_id && r.dimension_id)
    .map((r) => ({
      overlayId: r.overlay_id.trim(),
      operator: (r.operator || "").trim(),
      threshold: toFloat(r.threshold, 0.0),
      dimensionId: r.dimension_id.trim(),
      multiplier: toFloat(r.multiplier, 1.0),
    }));

  // 11. V5 Independent Params
  const v5IndependentParamsRows = readCsv("v5_independent_params.csv");
  const v5IndependentParams = {};
  for (const row of v5IndependentParamsRows) {
    const key = (row.key || "").trim();
    if (!key) continue;
    v5IndependentParams[key] = (row.value || "").trim();
  }

  // 12. V5 Prototype Helpers
  const v5HelperRows = readCsv("v5_prototype_helpers.csv");
  const v5PrototypeHelpers = v5HelperRows
    .filter((r) => r.archetype_name && r.dimension_id)
    .map((r) => ({
      archetypeId: parseInt(r.archetype_id, 10),
      archetypeName: r.archetype_name.trim(),
      dimensionId: r.dimension_id.trim(),
      minCoeff: toFloat(r.min_coeff, 0),
      meanUniformCoeff: toFloat(r.mean_uniform_coeff, 0.5),
      maxCoeff: toFloat(r.max_coeff, 1.0),
    }));

  // 13. V5 Archetype Calibration
  const v5CalibRows = readCsv("v5_archetype_calibration.csv");
  const v5ArchetypeCalibration = v5CalibRows
    .filter((r) => r.archetype_name)
    .map((r) => ({
      archetypeId: parseInt(r.archetype_id, 10),
      archetypeName: r.archetype_name.trim(),
      v5UsesBias: toBool(r.v5_uses_bias),
    }));

  // 14. V6 Question Logic
  const v6QuestionLogicRows = readCsv("v6_question_logic.csv");
  const multiselectScoringQuestions = v6QuestionLogicRows
    .filter(
      (r) =>
        r.question_id &&
        (r.v6_categorical_aggregation || "").trim() === "max_selected_answer_boost_per_archetype"
    )
    .map((r) => (r.question_id || "").trim());

  // ─── Build labelToCodeMap ──────────────────────────────────────────────────────
  // Maps { [questionId]: { [normalizedLabel]: answerCode } }
  // Built from categorical_map, categorical_boost_rules, enum_map
  const labelToCodeMap = {};

  function addLabelMapping(qid, label, code) {
    if (!qid || !label || !code) return;
    if (!labelToCodeMap[qid]) labelToCodeMap[qid] = {};
    const normalized = normalizeLabel(label);
    if (normalized) {
      labelToCodeMap[qid][normalized] = code;
    }
  }

  // From categorical_map
  for (const r of categoricalMap) {
    addLabelMapping(r.questionId, r.answerLabel, r.answerCode);
  }

  // From categorical_boost_rules
  for (const r of categoricalBoostRules) {
    addLabelMapping(r.questionId, r.answerLabel, r.answerCode);
  }

  // From enum_map
  for (const r of enumMap) {
    addLabelMapping(r.questionId, r.answerLabel, r.answerCode);
  }

  // ─── Generate TypeScript ───────────────────────────────────────────────────────
  const output = `// Auto-generated from data/scoring-config/ — do not edit manually
// Run: node scripts/update-scoring-config.js

// ─── Model Parameters ────────────────────────────────────────────────────────
export const modelParams: Record<string, string> = ${JSON.stringify(modelParams, null, 2)};

// ─── Dimensions (${dimensions.length}) ───────────────────────────────────────
export interface DimensionDef {
  id: string;
  name: string;
  qid: string;
  transform: string;
  defaultWeight: number;
}

export const dimensions: DimensionDef[] = ${JSON.stringify(dimensions, null, 2)};

// ─── Overlays (${overlays.length}) ───────────────────────────────────────────
export interface OverlayDef {
  id: string;
  name: string;
  qid: string;
  transform: string;
}

export const overlays: OverlayDef[] = ${JSON.stringify(overlays, null, 2)};

// ─── Archetype Prototypes (${archetypePrototypes.length} rows) ───────────────
export interface PrototypeDef {
  archetypeId: number;
  archetypeName: string;
  dimensionId: string;
  prototypeValue: number;
}

export const archetypePrototypes: PrototypeDef[] = ${JSON.stringify(archetypePrototypes, null, 2)};

// ─── Archetype Bias (${archetypeBias.length}) ────────────────────────────────
export interface BiasDef {
  archetypeName: string;
  biasAddToRawScore: number;
}

export const archetypeBias: BiasDef[] = ${JSON.stringify(archetypeBias, null, 2)};

// ─── Categorical Boost Rules (${categoricalBoostRules.length}) ───────────────
export interface BoostRuleDef {
  questionId: string;
  answerCode: string;
  answerLabel: string;
  archetypeName: string;
  scoreAdd: number;
}

export const categoricalBoostRules: BoostRuleDef[] = ${JSON.stringify(categoricalBoostRules, null, 2)};

// ─── Gates (${gates.length}) ─────────────────────────────────────────────────
export interface GateDef {
  archetypeName: string;
  dimensionId: string;
  operator: string;
  value: number;
  scoreAdjustmentIfFail: number;
}

export const gates: GateDef[] = ${JSON.stringify(gates, null, 2)};

// ─── Categorical Map (${categoricalMap.length}) ──────────────────────────────
export interface CategoricalMapDef {
  dimOvlId: string;
  questionId: string;
  answerCode: string;
  answerLabel: string;
  numericValue: number;
}

export const categoricalMap: CategoricalMapDef[] = ${JSON.stringify(categoricalMap, null, 2)};

// ─── Enum Map (${enumMap.length}) ────────────────────────────────────────────
export interface EnumMapDef {
  dimOvlId: string;
  questionId: string;
  answerCode: string;
  answerLabel: string;
}

export const enumMap: EnumMapDef[] = ${JSON.stringify(enumMap, null, 2)};

// ─── Weight Modifiers (${weightModifiers.length}) ────────────────────────────
export interface WeightModifierDef {
  overlayId: string;
  operator: string;
  threshold: number;
  dimensionId: string;
  multiplier: number;
}

export const weightModifiers: WeightModifierDef[] = ${JSON.stringify(weightModifiers, null, 2)};

// ─── Label-to-Code Map ──────────────────────────────────────────────────────
// { [questionId]: { [normalizedLabel]: answerCode } }
export const labelToCodeMap: Record<string, Record<string, string>> = ${JSON.stringify(labelToCodeMap, null, 2)};

// ─── V5 Independent Params (${Object.keys(v5IndependentParams).length}) ──────────────────────
export const v5IndependentParams: Record<string, string> = ${JSON.stringify(v5IndependentParams, null, 2)};

// ─── V5 Prototype Helpers (${v5PrototypeHelpers.length} rows) ────────────────────────────────
export interface V5PrototypeHelperDef {
  archetypeId: number;
  archetypeName: string;
  dimensionId: string;
  minCoeff: number;
  meanUniformCoeff: number;
  maxCoeff: number;
}

export const v5PrototypeHelpers: V5PrototypeHelperDef[] = ${JSON.stringify(v5PrototypeHelpers, null, 2)};

// ─── V5 Archetype Calibration (${v5ArchetypeCalibration.length} rows) ────────────────────────
export interface V5ArchetypeCalibrationDef {
  archetypeId: number;
  archetypeName: string;
  v5UsesBias: boolean;
}

export const v5ArchetypeCalibration: V5ArchetypeCalibrationDef[] = ${JSON.stringify(v5ArchetypeCalibration, null, 2)};

// ─── Multiselect Scoring Questions (${multiselectScoringQuestions.length}) ──────────────────
// Questions that use per-archetype MAX across selected answer-code boosts (not sum)
export const multiselectScoringQuestions: string[] = ${JSON.stringify(multiselectScoringQuestions, null, 2)};
`;

  fs.writeFileSync(tsPath, output, "utf-8");

  console.log(`Written ${tsPath}`);
  console.log(`  Dimensions: ${dimensions.length}`);
  console.log(`  Overlays: ${overlays.length}`);
  console.log(`  Archetype prototypes: ${archetypePrototypes.length}`);
  console.log(`  Archetype bias: ${archetypeBias.length}`);
  console.log(`  Categorical boost rules: ${categoricalBoostRules.length}`);
  console.log(`  Gates: ${gates.length}`);
  console.log(`  Categorical map: ${categoricalMap.length}`);
  console.log(`  Enum map: ${enumMap.length}`);
  console.log(`  Weight modifiers: ${weightModifiers.length}`);
  console.log(`  Label-to-code questions: ${Object.keys(labelToCodeMap).length}`);
  console.log(`  V5 independent params: ${Object.keys(v5IndependentParams).length}`);
  console.log(`  V5 prototype helpers: ${v5PrototypeHelpers.length}`);
  console.log(`  V5 archetype calibration: ${v5ArchetypeCalibration.length}`);
  console.log(
    `  Multiselect scoring questions: ${multiselectScoringQuestions.length} (${multiselectScoringQuestions.join(", ")})`
  );
}

main();
