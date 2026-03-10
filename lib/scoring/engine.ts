/**
 * V3 Archetype Scoring Engine
 *
 * Faithful TypeScript port of the reference JS implementation.
 * Pure CPU, no I/O — safe for server-side use in API routes.
 */

import type { ScoringConfig, ScoringResult } from "./types";

// ─── Utility helpers ─────────────────────────────────────────────────────────

function normalizeToken(value: unknown): string {
  if (value == null) return "";
  let s = String(value).trim();
  if (/^\d+\.0$/.test(s)) s = s.slice(0, -2);
  return s;
}

function toFloat(x: unknown, def = 0.0): number {
  if (typeof x === "boolean") return x ? 1.0 : 0.0;
  const s = normalizeToken(x);
  if (!s) return def;
  const v = Number(s);
  return Number.isFinite(v) ? v : def;
}

function toBool(x: unknown, def = false): boolean {
  if (typeof x === "boolean") return x;
  const s = normalizeToken(x).toLowerCase();
  if (["true", "1", "yes", "y", "t"].includes(s)) return true;
  if (["false", "0", "no", "n", "f"].includes(s)) return false;
  return def;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

// ─── Transforms ──────────────────────────────────────────────────────────────

export function scale1_7to0_1(x: unknown): number | null {
  const v = toFloat(x, NaN);
  if (!Number.isFinite(v) || v < 1 || v > 7) return null;
  return (v - 1) / 6;
}

export function softmax(scores: Record<string, number>, temperature = 1.0): Record<string, number> {
  const keys = Object.keys(scores);
  const vals = keys.map((k) => scores[k] / Math.max(temperature, 1e-9));
  const m = Math.max(...vals);
  const exps = vals.map((v) => Math.exp(v - m));
  const z = exps.reduce((a, b) => a + b, 0) || 1.0;

  const out: Record<string, number> = {};
  keys.forEach((k, i) => {
    out[k] = exps[i] / z;
  });
  return out;
}

// ─── Answer code extraction ──────────────────────────────────────────────────

function extractAnswerCode(raw: unknown): string | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) return null;
  if (typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    for (const key of ["answer_code", "code", "value", "id"]) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const value = normalizeToken(obj[key]);
        return value || null;
      }
    }
    return null;
  }
  const value = normalizeToken(raw);
  return value || null;
}

function extractAnswerCodes(raw: unknown): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    const out: string[] = [];
    raw.forEach((item) => {
      const code = extractAnswerCode(item);
      if (code) out.push(code);
    });
    return out;
  }
  const code = extractAnswerCode(raw);
  return code ? [code] : [];
}

function normalizePassthrough(raw: unknown): unknown {
  if (raw == null) return null;
  if (Array.isArray(raw)) return raw.map(normalizePassthrough);
  if (typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(obj, "answer_code")) {
      return normalizeToken(obj.answer_code);
    }
    return { ...obj };
  }
  return raw;
}

// ─── QID canonicalization ────────────────────────────────────────────────────

function canonicalizeQid(rawQid: string, knownQids: Set<string>): string {
  const qid = normalizeToken(rawQid);
  if (knownQids.has(qid)) return qid;

  if (/^\d+$/.test(qid)) {
    const padded = qid.padStart(5, "0");
    if (knownQids.has(padded)) return padded;

    const matches = [...knownQids].filter((k) => k.endsWith(qid));
    if (matches.length === 1) return matches[0];
  }

  return qid;
}

// ─── Label → Code resolution ────────────────────────────────────────────────

function normalizeLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/\u201C|\u201D/g, '"')
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\s+/g, " ");
}

/**
 * Resolve a survey answer (which may be a full label string) to its answer code.
 * For scale questions (numbers), returns the number as-is.
 * For categorical questions, looks up the label in the label-to-code map.
 */
function resolveAnswerValue(
  qid: string,
  raw: unknown,
  labelMap: Record<string, Record<string, string>>
): unknown {
  // Numbers pass through directly (scale values)
  if (typeof raw === "number") return raw;

  // Arrays (multi-select): resolve each element
  if (Array.isArray(raw)) {
    return raw.map((item) => resolveAnswerValue(qid, item, labelMap));
  }

  // String: try label-to-code lookup
  if (typeof raw === "string") {
    const qidMap = labelMap[qid];
    if (!qidMap) return raw; // no mapping for this qid

    const normalized = normalizeLabel(raw);

    // Exact match
    if (qidMap[normalized]) return qidMap[normalized];

    // Prefix match: truncate at " - " or " – " for phase questions with long descriptions
    const dashIdx = normalized.indexOf(" - ");
    const enDashIdx = normalized.indexOf(" – ");
    const truncIdx = Math.min(
      dashIdx >= 0 ? dashIdx : Infinity,
      enDashIdx >= 0 ? enDashIdx : Infinity
    );
    if (truncIdx < Infinity) {
      const prefix = normalized.slice(0, truncIdx).trim();
      if (qidMap[prefix]) return qidMap[prefix];
    }

    // Fuzzy: check if any map key is a prefix of the normalized label
    for (const [mapLabel, code] of Object.entries(qidMap)) {
      if (normalized.startsWith(mapLabel)) return code;
    }

    return raw; // fallback: return as-is
  }

  return raw;
}

// ─── Scalar transform ────────────────────────────────────────────────────────

function transformScalar(
  raw: unknown,
  transformName: string,
  targetId: string,
  questionId: string,
  scalarMap: Map<string, number>
): number | null {
  if (raw == null) return null;

  if (transformName === "scale_1_7_to_0_1") {
    const v = scale1_7to0_1(raw);
    return v == null ? null : clamp(v, 0, 1);
  }

  if (["categorical_to_numeric", "likert5_to_0_1", "likert4_to_0_1"].includes(transformName)) {
    const answerCode = extractAnswerCode(raw);
    if (!answerCode) return null;
    const v = scalarMap.get(`${targetId}||${questionId}||${answerCode}`);
    return v == null ? null : clamp(v, 0, 1);
  }

  const v = toFloat(raw, NaN);
  return Number.isFinite(v) ? clamp(v, 0, 1) : null;
}

// ─── Enum transform ──────────────────────────────────────────────────────────

function transformEnum(
  raw: unknown,
  overlayId: string,
  questionId: string,
  enumMapData: Map<string, Set<string>>
): { answer_code: string | null; one_hot: Record<string, number> } {
  const validCodes = [
    ...(enumMapData.get(`${overlayId}||${questionId}`) || new Set<string>()),
  ].sort();
  const oneHot: Record<string, number> = {};
  validCodes.forEach((code) => {
    oneHot[code] = 0;
  });

  const answerCode = extractAnswerCode(raw);
  if (!answerCode || !(answerCode in oneHot)) {
    return { answer_code: null, one_hot: oneHot };
  }

  oneHot[answerCode] = 1;
  return { answer_code: answerCode, one_hot: oneHot };
}

// ─── Tags transform ──────────────────────────────────────────────────────────

function transformTags(raw: unknown): string[] {
  return [...new Set(extractAnswerCodes(raw))];
}

// ─── Main scoring function ───────────────────────────────────────────────────

export function scoreArchetypes(
  config: ScoringConfig,
  responses: Record<string, unknown>
): ScoringResult {
  const mp = config.modelParams;

  const temperature = toFloat(mp.softmax_temperature, 1.25);
  const softmaxFloor = toFloat(mp.softmax_floor, 0.0);

  const biasEnabled = toBool(mp.archetype_bias_enabled, false);
  const biasScale = toFloat(mp.archetype_bias_scale, 0.0);

  const centerBoosts = toBool(mp.categorical_boost_centering_enabled, false);
  const centerMissingDefault = toFloat(mp.categorical_boost_centering_missing_default, 0.0);

  const wmEnabled = toBool(mp.weight_modifiers_enabled, false);
  const wmClampMin = toFloat(mp.weight_modifiers_clamp_min, 0.0);
  const wmClampMax = toFloat(mp.weight_modifiers_clamp_max, 1e9);

  // Step 1: Canonicalize QIDs
  const responsesNorm: Record<string, unknown> = {};
  for (const [rawQid, value] of Object.entries(responses)) {
    const qid = canonicalizeQid(rawQid, config.knownQids);
    // Step 2: Resolve labels to codes
    responsesNorm[qid] = resolveAnswerValue(qid, value, config.labelToCode);
  }

  // Step 3: Build overlay outputs
  const overlaysScalar: Record<string, number> = {};
  const overlaysEnum: Record<
    string,
    { answer_code: string | null; one_hot: Record<string, number> }
  > = {};
  const overlaysTags: Record<string, string[]> = {};
  const overlaysText: Record<string, unknown> = {};
  const overlaysMissing = new Set<string>();

  for (const spec of Object.values(config.overlays)) {
    const raw = responsesNorm[spec.qid];

    if (
      ["scale_1_7_to_0_1", "likert5_to_0_1", "likert4_to_0_1", "categorical_to_numeric"].includes(
        spec.transform
      )
    ) {
      const v = transformScalar(raw, spec.transform, spec.id, spec.qid, config.scalarMap);
      overlaysScalar[spec.id] = v == null ? 0.5 : v;
      if (v == null) overlaysMissing.add(spec.id);
      continue;
    }

    if (spec.transform === "categorical_to_onehot") {
      overlaysEnum[spec.id] = transformEnum(raw, spec.id, spec.qid, config.enumMap);
      continue;
    }

    if (["multiselect_to_support_tags", "multiselect_to_barrier_tags"].includes(spec.transform)) {
      overlaysTags[spec.id] = transformTags(raw);
      continue;
    }

    if (["categorical_passthrough", "string_passthrough"].includes(spec.transform)) {
      overlaysText[spec.id] = normalizePassthrough(raw);
      continue;
    }
  }

  // Step 4: Build dimension vector
  const uDimensions: Record<string, number> = {};
  const baseWeights: Record<string, number> = {};
  for (const spec of Object.values(config.dimensions)) {
    const raw = responsesNorm[spec.qid];
    const v = transformScalar(raw, spec.transform, spec.id, spec.qid, config.scalarMap);
    uDimensions[spec.id] = v == null ? 0.5 : v;
    baseWeights[spec.id] = spec.weight;
  }

  // Step 5: Apply weight modifiers
  const weightsFinal = { ...baseWeights };
  if (wmEnabled && config.weightModifiers.length) {
    for (const rule of config.weightModifiers) {
      const ov = overlaysScalar[rule.overlayId] ?? 0.5;
      let ok = false;

      if (rule.operator === ">=") ok = ov >= rule.threshold;
      else if (rule.operator === "<=") ok = ov <= rule.threshold;
      else if (rule.operator === ">") ok = ov > rule.threshold;
      else if (rule.operator === "<") ok = ov < rule.threshold;
      else if (rule.operator === "==") ok = ov === rule.threshold;

      if (ok && Object.prototype.hasOwnProperty.call(weightsFinal, rule.dimensionId)) {
        weightsFinal[rule.dimensionId] *= rule.multiplier;
      }
    }

    for (const dimId of Object.keys(weightsFinal)) {
      weightsFinal[dimId] = clamp(weightsFinal[dimId], wmClampMin, wmClampMax);
    }
  }

  // Step 6: Base similarity score
  const rawScore: Record<string, number> = {};
  for (const archetype of config.archetypes) {
    let s = 0.0;
    for (const dimId of Object.keys(weightsFinal)) {
      const p = config.prototypes.get(`${archetype}||${dimId}`) ?? 0.5;
      s += weightsFinal[dimId] * (1 - Math.abs(uDimensions[dimId] - p));
    }
    rawScore[archetype] = s;
  }

  // Step 7: Apply gates
  for (const gate of config.gates) {
    const val = uDimensions[gate.dimension] ?? 0.5;
    if (val < gate.threshold) rawScore[gate.archetype] -= gate.penalty;
  }

  // Step 8: Categorical boosts
  const answeredPairs: [string, string][] = [];
  for (const [qid, raw] of Object.entries(responsesNorm)) {
    for (const ac of extractAnswerCodes(raw)) {
      answeredPairs.push([qid, ac]);
    }
  }

  if (centerBoosts) {
    const nArchetypes = config.archetypes.length || 1;
    for (const [qid, answerCode] of answeredPairs) {
      const rules = config.boosts.get(`${qid}||${answerCode}`) || [];
      if (!rules.length) continue;

      const boostVector: Record<string, number> = {};
      for (const a of config.archetypes) {
        boostVector[a] = centerMissingDefault;
      }
      for (const rule of rules) {
        boostVector[rule.archetype] = rule.scoreAdd;
      }

      const meanBoost = Object.values(boostVector).reduce((a, b) => a + b, 0) / nArchetypes;
      for (const a of config.archetypes) {
        rawScore[a] += boostVector[a] - meanBoost;
      }
    }
  } else {
    for (const [qid, answerCode] of answeredPairs) {
      const rules = config.boosts.get(`${qid}||${answerCode}`) || [];
      for (const rule of rules) {
        rawScore[rule.archetype] += rule.scoreAdd;
      }
    }
  }

  // Step 9: Archetype bias
  if (biasEnabled) {
    for (const a of config.archetypes) {
      rawScore[a] += biasScale * (config.bias[a] ?? 0.0);
    }
  }

  // Step 10: Softmax
  let probs = softmax(rawScore, temperature);
  if (softmaxFloor > 0) {
    for (const a of Object.keys(probs)) {
      probs[a] += softmaxFloor;
    }
    const z = Object.values(probs).reduce((a, b) => a + b, 0) || 1.0;
    for (const a of Object.keys(probs)) {
      probs[a] /= z;
    }
  }

  const percent: Record<string, number> = {};
  for (const a of Object.keys(probs)) {
    percent[a] = 100 * probs[a];
  }

  // Determine primary archetype
  let primaryArchetype = config.archetypes[0];
  let maxPercent = -Infinity;
  for (const [a, p] of Object.entries(percent)) {
    if (p > maxPercent) {
      maxPercent = p;
      primaryArchetype = a;
    }
  }

  return {
    rawScore,
    percent,
    primaryArchetype,
    diagnostics: {
      uDimensions,
      dimensionWeightsBase: baseWeights,
      dimensionWeightsFinal: weightsFinal,
      overlaysScalar,
      overlaysEnum,
      overlaysTags,
      overlaysText,
      overlaysMissing: [...overlaysMissing].sort(),
    },
  };
}
