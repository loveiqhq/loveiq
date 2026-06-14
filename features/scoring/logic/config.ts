import {
  modelParams,
  dimensions as dimensionsDef,
  overlays as overlaysDef,
  archetypePrototypes,
  archetypeBias,
  categoricalBoostRules,
  gates as gatesDef,
  categoricalMap,
  enumMap as enumMapDef,
  weightModifiers as weightModifiersDef,
  labelToCodeMap,
  v5PrototypeHelpers,
  v5ArchetypeCalibration as v5ArchetypeCalibrationDef,
  multiselectScoringQuestions as multiselectScoringQids,
} from "@/data/scoring-config";
import type {
  ScoringConfig,
  DimensionSpec,
  OverlaySpec,
  BoostEntry,
  GateRule,
  WeightModifierRule,
  V5PrototypeHelper,
  V5ArchetypeCalibration,
} from "./types";

let cachedConfig: ScoringConfig | null = null;

function toBoolLocal(v: string | undefined, def: boolean): boolean {
  if (v == null || v === "") return def;
  const s = String(v).trim().toLowerCase();
  if (["true", "yes", "y", "t"].includes(s)) return true;
  if (["false", "no", "n", "f"].includes(s)) return false;
  const n = Number(s);
  if (Number.isFinite(n)) return n !== 0;
  return def;
}

function toFloatLocal(v: string | undefined, def: number): number {
  if (v == null || v === "") return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

// ─── Survey-label aliases (V3 content-drift bridge) ──────────────────────────
// The 2026-05-19 V3 refresh reworded some survey option labels in
// data/survey-data.ts, but the scoring workbook (the source of labelToCodeMap)
// kept the older canonical labels for a few questions. So resolveAnswerValue can
// no longer map the V3 label → code, and that answer silently scores as nothing
// (Q14020 — a scored multiselect — and three Q15005 options were affected from
// 2026-05-19). Each pair below re-attaches a V3 survey label to the EXISTING
// code of its canonical counterpart; the code is looked up from labelToCodeMap
// at build time and never hardcoded, so a later workbook fix or rename can't
// desync it (and becomes a redundant no-op). Only add a pair when the V3 label
// genuinely fails to resolve. 03003/10002 already carry V3 labels — not listed.
const SURVEY_LABEL_ALIASES: Record<string, ReadonlyArray<readonly [string, string]>> = {
  // qid: [ [V3 survey label, canonical label already present in labelToCodeMap] ]
  "14020": [
    ["Feeling emotionally close to the other person", "Bonding and closeness"],
    ["Fun and play — pleasure for its own sake", "Pleasure and play"],
    ["Trying something new or unfamiliar", "Novelty and discovery"],
    ["Strong charge, tension, or edge", "Intensity and edge"],
    ["Feeling wanted, desired, or chosen", "Feeling desired"],
    ["A clear lead/follow dynamic between us", "Power and polarity"],
    ["Meaning, depth, or devotion", "Meaning and devotion"],
    ["Pleasing or taking care of the other person", "Giving and service"],
    ["Comfort, soothing, or stress relief", "Comfort and familiarity"],
  ],
  "15005": [
    ["Yes, youngest is 0–3", "Yes, youngest child is 0-3 years"],
    ["Yes, youngest is 4–10", "Yes, youngest child is 4-10 years"],
    ["Yes, youngest is 11–17", "Yes, youngest child is 11-17 years"],
  ],
};

// Mirror of engine.ts normalizeLabel — labelToCodeMap keys are stored normalized.
function normalizeLabelLocal(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/“|”/g, '"')
    .replace(/‘|’/g, "'")
    .replace(/–|—/g, "-")
    .replace(/\s+/g, " ");
}

/**
 * Augment labelToCodeMap with the V3 survey-label aliases above. Pure: returns a
 * new map, mutates nothing. A pair is skipped when either the qid or the
 * canonical label is absent, so a stale alias can never inject a wrong code.
 */
function applySurveyLabelAliases(
  map: Record<string, Record<string, string>>
): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = { ...map };
  for (const [qid, pairs] of Object.entries(SURVEY_LABEL_ALIASES)) {
    const qidMap = out[qid];
    if (!qidMap) continue;
    const merged: Record<string, string> = { ...qidMap };
    for (const [surveyLabel, canonicalLabel] of pairs) {
      const code = qidMap[normalizeLabelLocal(canonicalLabel)];
      if (code != null) merged[normalizeLabelLocal(surveyLabel)] = code;
    }
    out[qid] = merged;
  }
  return out;
}

function buildConfig(): ScoringConfig {
  const knownQids = new Set<string>();

  // Dimensions
  const dimensions: Record<string, DimensionSpec> = {};
  for (const d of dimensionsDef) {
    knownQids.add(d.qid);
    dimensions[d.id] = {
      id: d.id,
      qid: d.qid,
      transform: d.transform,
      weight: d.defaultWeight,
    };
  }

  // Overlays
  const overlays: Record<string, OverlaySpec> = {};
  for (const o of overlaysDef) {
    knownQids.add(o.qid);
    overlays[o.id] = {
      id: o.id,
      qid: o.qid,
      transform: o.transform,
    };
  }

  // Archetypes (sorted unique names from prototypes)
  const archetypes = [...new Set(archetypePrototypes.map((p) => p.archetypeName))].sort();

  // Prototype map: "archetype||dimId" → value
  const prototypes = new Map<string, number>();
  for (const p of archetypePrototypes) {
    prototypes.set(`${p.archetypeName}||${p.dimensionId}`, p.prototypeValue);
  }

  // Bias map
  const biasEntries = new Map<string, number>(archetypes.map((archetype) => [archetype, 0.0]));
  for (const b of archetypeBias) {
    biasEntries.set(b.archetypeName, b.biasAddToRawScore);
  }
  const bias = Object.fromEntries(biasEntries) as Record<string, number>;

  // Boost map: "qid||answerCode" → entries[]
  const boosts = new Map<string, BoostEntry[]>();
  for (const r of categoricalBoostRules) {
    const key = `${r.questionId}||${r.answerCode}`;
    const arr = boosts.get(key) || [];
    arr.push({
      archetype: r.archetypeName,
      scoreAdd: r.scoreAdd,
    });
    boosts.set(key, arr);
  }

  // Gates
  const gates: GateRule[] = gatesDef.map((g) => ({
    archetype: g.archetypeName,
    dimension: g.dimensionId,
    operator: g.operator,
    value: g.value,
    scoreAdjustmentIfFail: g.scoreAdjustmentIfFail,
  }));

  // Scalar map: "targetId||qid||answerCode" → numeric
  const scalarMap = new Map<string, number>();
  for (const r of categoricalMap) {
    scalarMap.set(`${r.dimOvlId}||${r.questionId}||${r.answerCode}`, r.numericValue);
  }

  // Enum map: "overlayId||qid" → Set<answerCode>
  const enumMapCompiled = new Map<string, Set<string>>();
  for (const r of enumMapDef) {
    const key = `${r.dimOvlId}||${r.questionId}`;
    const s = enumMapCompiled.get(key) || new Set<string>();
    s.add(r.answerCode);
    enumMapCompiled.set(key, s);
  }

  // Weight modifiers
  const weightMods: WeightModifierRule[] = weightModifiersDef.map((r) => ({
    overlayId: r.overlayId,
    operator: r.operator,
    threshold: r.threshold,
    dimensionId: r.dimensionId,
    multiplier: r.multiplier,
  }));

  // Archetype IDs (from prototypes)
  const archetypeIds: Record<string, number> = {};
  for (const p of archetypePrototypes) {
    if (!(p.archetypeName in archetypeIds)) {
      archetypeIds[p.archetypeName] = p.archetypeId;
    }
  }

  // V5 prototype helpers map: "archetype||dimId" → helper
  const v5Helpers = new Map<string, V5PrototypeHelper>();
  for (const h of v5PrototypeHelpers) {
    v5Helpers.set(`${h.archetypeName}||${h.dimensionId}`, {
      archetypeId: h.archetypeId,
      archetypeName: h.archetypeName,
      dimensionId: h.dimensionId,
      minCoeff: h.minCoeff,
      meanUniformCoeff: h.meanUniformCoeff,
      maxCoeff: h.maxCoeff,
    });
  }

  const v5Calibration = new Map<string, V5ArchetypeCalibration>();
  const v5CategoricalInterceptByArchetype: Record<string, number> = Object.fromEntries(
    archetypes.map((archetype) => [archetype, 0.0])
  );
  for (const row of v5ArchetypeCalibrationDef) {
    const calibration: V5ArchetypeCalibration = {
      archetypeId: row.archetypeId,
      archetypeName: row.archetypeName,
      v5UsesBias: row.v5UsesBias,
      expectedCategoricalLiftAfterQuestionScaling: row.expectedCategoricalLiftAfterQuestionScaling,
      v5CategoricalInterceptScale: row.v5CategoricalInterceptScale,
      v5CategoricalInterceptSubtract: row.v5CategoricalInterceptSubtract,
    };
    v5Calibration.set(row.archetypeName, calibration);
    v5CategoricalInterceptByArchetype[row.archetypeName] = row.v5CategoricalInterceptSubtract;
  }

  const v5Enabled = toBoolLocal(modelParams.v5_final_match_enabled, false);
  const v5CategoricalInterceptEnabled = toBoolLocal(
    modelParams.v5_final_categorical_intercept_enabled,
    false
  );
  const v5SpacingGapMin = toFloatLocal(modelParams.v5_final_spacing_gap_min, 3.0);
  const v5SpacingGapMax = toFloatLocal(modelParams.v5_final_spacing_gap_max, 4.0);
  const v5RoundDigits = parseInt(modelParams.v5_final_round_digits || "1", 10);

  return {
    modelParams,
    archetypes,
    dimensions,
    overlays,
    prototypes,
    bias,
    boosts,
    gates,
    scalarMap,
    enumMap: enumMapCompiled,
    weightModifiers: weightMods,
    knownQids,
    labelToCode: applySurveyLabelAliases(labelToCodeMap),
    archetypeIds,
    v5Helpers,
    v5Calibration,
    multiselectScoringQuestions: new Set(multiselectScoringQids),
    v5Enabled,
    v5CategoricalInterceptEnabled,
    v5CategoricalInterceptByArchetype,
    v5SpacingGapMin,
    v5SpacingGapMax,
    v5RoundDigits,
  };
}

/** Get the compiled scoring config (singleton, built once per process) */
export function getScoringConfig(): ScoringConfig {
  if (!cachedConfig) {
    cachedConfig = buildConfig();
  }
  return cachedConfig;
}

// F-03: SHA-256 of the compiled config. Same config in two processes =>
// same hash. When CSVs change at deploy time, the new process gets a
// fresh hash and every new scoring_result row records it. Historical rows
// remain queryable by their original hash for replay.
let cachedConfigSha: string | null = null;

export function getScoringConfigSha(): string {
  if (cachedConfigSha) return cachedConfigSha;
  // Lazy require so a Node-only crypto import doesn't pull into edge bundles
  // that don't call this helper.
  const { createHash } = require("crypto") as typeof import("crypto");
  const cfg = getScoringConfig();
  // JSON.stringify on the cached object: deterministic per process because
  // buildConfig produces the same object shape from the same CSV imports.
  // We hash the entire compiled shape — gates, boosts, calibration,
  // prototypes — so any field flip changes the hash.
  cachedConfigSha = createHash("sha256").update(JSON.stringify(cfg)).digest("hex");
  return cachedConfigSha;
}
