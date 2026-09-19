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

/** V5 per-archetype calibration inputs */
export interface V5ArchetypeCalibration {
  archetypeId: number;
  archetypeName: string;
  v5UsesBias: boolean;
  expectedCategoricalLiftAfterQuestionScaling: number;
  v5CategoricalInterceptScale: number;
  v5CategoricalInterceptSubtract: number;
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
  prototypes: Map<string, number>; // "archetype||dimId" -> value
  bias: Record<string, number>;
  boosts: Map<string, BoostEntry[]>; // "qid||answerCode" -> entries
  gates: GateRule[];
  scalarMap: Map<string, number>; // "targetId||qid||answerCode" -> numeric
  enumMap: Map<string, Set<string>>; // "overlayId||qid" -> valid codes
  weightModifiers: WeightModifierRule[];
  knownQids: Set<string>;
  labelToCode: Record<string, Record<string, string>>; // qid -> { label -> code }
  // V5 additions
  archetypeIds: Record<string, number>; // archetype name -> numeric ID
  v5Helpers: Map<string, V5PrototypeHelper>; // "archetype||dimId" -> helper
  v5Calibration: Map<string, V5ArchetypeCalibration>; // archetype name -> calibration row
  multiselectScoringQuestions: Set<string>; // QIDs using per-archetype MAX aggregation
  v5Enabled: boolean;
  v5CategoricalInterceptEnabled: boolean;
  v5CategoricalInterceptByArchetype: Record<string, number>;
  v5SpacingGapMin: number;
  v5SpacingGapMax: number;
  v5RoundDigits: number;
}

/** Scoring result returned by the engine */
export interface ScoringResult {
  rawScore: Record<string, number>;
  percent: Record<string, number>;
  primaryArchetype: string;
  /**
   * How urgent this person says working on their sexuality is, on the 1-7 scale the
   * question (16002) was actually asked on — NOT the 0-1 form the engine works in.
   *
   * Promoted out of `diagnostics` because it is a product signal rather than a debugging
   * detail: it splits the audience close to evenly, which is what makes it usable for
   * deciding what to show someone. The score was already computed on every submission;
   * only a way to reach it was missing.
   *
   * `null` when the question was not answered. Deliberately not 4: an unanswered overlay
   * defaults to 0.5 internally, which converts back to a perfectly plausible mid-scale
   * answer nobody gave. Anything keyed on this must be able to tell "middling" from
   * "unknown", or it will confidently act on a number it invented.
   */
  urgency: number | null;
  /**
   * The FIRST change this person picked on 16001 — what they most want to work on.
   *
   * Promoted out of `diagnostics` for the same reason as `urgency`: it is the answer to a
   * product question ("what should this report lead with"), not a debugging detail. The
   * question is capped at two picks and its options are shown in a randomised, recorded
   * order, so first-picked is a genuine ranking rather than a side effect of which option
   * happened to sit at the top of the list.
   *
   * `null` when 16001 was not answered — never a guessed default, because a consumer
   * ordering content by focus has to be able to choose its own fallback rather than
   * silently lead with someone else's priority.
   */
  focusPrimary: string | null;
  /**
   * What this person says is getting in the way, from 16014 — capped at one pick, so in
   * practice zero or one tag.
   *
   * Empty array when unanswered. Worth knowing before using it: the barrier does NOT
   * predict which FORMAT someone would buy (cross-tabbed against 16007 it moves only
   * between 4.8% and 12.3% around a 7.5% baseline). Use it for what an offer is ABOUT;
   * use help style for what shape it takes.
   */
  barrierTags: string[];
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
