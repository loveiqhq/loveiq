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
  threshold: number;
  penalty: number;
}

/** Categorical boost entry */
export interface BoostEntry {
  archetype: string;
  scoreAdd: number;
  category: string;
}

/** Weight modifier rule */
export interface WeightModifierRule {
  overlayId: string;
  operator: string;
  threshold: number;
  dimensionId: string;
  multiplier: number;
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
}
