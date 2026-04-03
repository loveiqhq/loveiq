/** Parsed dimension spec from config */
export interface DimensionSpec {
  id: string;
  qid: string;
  transform: string;
  weight: number;
}

/** Parsed overlay spec from config */
export interface OverlaySpec {
  id: string;
  qid: string;
  transform: string;
}

/** Gate rule */
export interface GateRule {
  archetype: string;
  dimension: string;
  operator: string;
  value: number;
  scoreAdjustmentIfFail: number;
}

/** Categorical boost entry */
export interface BoostEntry {
  archetype: string;
  scoreAdd: number;
}

/** Weight modifier rule */
export interface WeightModifierRule {
  overlayId: string;
  operator: string;
  threshold: number;
  dimensionId: string;
  multiplier: number;
}

/** V5 per-archetype-dimension coefficients for anchor computation */
export interface V5PrototypeHelper {
  archetypeId: number;
  archetypeName: string;
  dimensionId: string;
  minCoeff: number;
  meanUniformCoeff: number;
  maxCoeff: number;
}

/** V5 scoring result (independent match percentages, NOT summing to 100) */
export interface V5ScoringResult {
  rawTotal: Record<string, number>;
  rawPct: Record<string, number>;
  finalPct: Record<string, number>;
  ranking: string[];
  primaryArchetype: string;
  diagnostics: {
    anchors: Record<string, { rawMin: number; rawMean: number; rawMax: number }>;
    gaps: Record<string, number>;
    payloadFingerprint: string;
  };
}

/** Full compiled scoring config (ready for engine use) */
export interface ScoringConfig {
  modelParams: Record<string, string>;
  archetypes: string[];
  dimensions: Record<string, DimensionSpec>;
  overlays: Record<string, OverlaySpec>;
  prototypes: Map<string, number>; // "archetype||dimId" → value
  bias: Record<string, number>;
  boosts: Map<string, BoostEntry[]>; // "qid||answerCode" → entries
  gates: GateRule[];
  scalarMap: Map<string, number>; // "targetId||qid||answerCode" → numeric
  enumMap: Map<string, Set<string>>; // "overlayId||qid" → valid codes
  weightModifiers: WeightModifierRule[];
  knownQids: Set<string>;
  labelToCode: Record<string, Record<string, string>>; // qid → { label → code }
  // V5 additions
  archetypeIds: Record<string, number>; // archetype name → numeric ID
  v5Helpers: Map<string, V5PrototypeHelper>; // "archetype||dimId" → helper
  multiselectScoringQuestions: Set<string>; // QIDs using per-archetype MAX aggregation
  v5Enabled: boolean;
  v5SpacingGapMin: number;
  v5SpacingGapMax: number;
  v5RoundDigits: number;
}

/** Scoring result returned by the engine */
export interface ScoringResult {
  rawScore: Record<string, number>;
  percent: Record<string, number>;
  primaryArchetype: string;
  diagnostics: {
    uDimensions: Record<string, number>;
    dimensionWeightsBase: Record<string, number>;
    dimensionWeightsFinal: Record<string, number>;
    overlaysScalar: Record<string, number>;
    overlaysEnum: Record<string, { answer_code: string | null; one_hot: Record<string, number> }>;
    overlaysTags: Record<string, string[]>;
    overlaysText: Record<string, unknown>;
    overlaysMissing: string[];
  };
  v5?: V5ScoringResult;
}
