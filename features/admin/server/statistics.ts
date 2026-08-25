export type StatisticalSignificance =
  | "significant-lift"
  | "significant-regression"
  | "inconclusive"
  | "insufficient-data";

export interface StatisticalSignal {
  method: "two-proportion" | "count-delta" | "mean-difference";
  delta: number;
  pValue: number | null;
  ciLow: number | null;
  ciHigh: number | null;
  significance: StatisticalSignificance;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function erf(x: number) {
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * absX);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
  return sign * y;
}

function normalCdf(z: number) {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

/**
 * The normal approximation needs at least this many successes AND this many
 * failures in every cell before its p-value and interval mean anything. Exported
 * so a caller explaining WHY it refused to judge quotes the same number.
 */
export const MIN_CELL_COUNT = 5;

export function twoProportionSignal(
  controlSampleSize: number,
  controlSuccessCount: number,
  variantSampleSize: number,
  variantSuccessCount: number
): StatisticalSignal {
  if (
    controlSampleSize <= 0 ||
    variantSampleSize <= 0 ||
    controlSuccessCount < 0 ||
    variantSuccessCount < 0 ||
    controlSuccessCount > controlSampleSize ||
    variantSuccessCount > variantSampleSize
  ) {
    return {
      method: "two-proportion",
      delta: 0,
      pValue: null,
      ciLow: null,
      ciHigh: null,
      significance: "insufficient-data",
    };
  }

  const controlRate = controlSuccessCount / controlSampleSize;
  const variantRate = variantSuccessCount / variantSampleSize;
  const delta = (variantRate - controlRate) * 100;
  const pooledRate =
    (controlSuccessCount + variantSuccessCount) / (controlSampleSize + variantSampleSize);
  const pooledSe = Math.sqrt(
    pooledRate * (1 - pooledRate) * (1 / controlSampleSize + 1 / variantSampleSize)
  );
  const unpooledSe = Math.sqrt(
    (controlRate * (1 - controlRate)) / controlSampleSize +
      (variantRate * (1 - variantRate)) / variantSampleSize
  );

  const z = pooledSe > 0 ? (variantRate - controlRate) / pooledSe : 0;
  const pValue = pooledSe > 0 ? clamp(2 * (1 - normalCdf(Math.abs(z))), 0, 1) : null;
  const ciLow = unpooledSe > 0 ? (variantRate - controlRate - 1.96 * unpooledSe) * 100 : null;
  const ciHigh = unpooledSe > 0 ? (variantRate - controlRate + 1.96 * unpooledSe) * 100 : null;

  let significance: StatisticalSignificance = "inconclusive";
  // Two floors, because the sample-size one alone was not enough.
  //
  // The normal approximation this function just ran needs at least ~5 successes
  // AND ~5 failures in EVERY cell; below that the p-value and the interval are
  // decoration. Counting only denominators let the report purchases split
  // (5/145 vs 4/187, n = 332) sail through as "inconclusive" with a printed
  // p-value and CI — so a reader saw a delta and an interval and concluded
  // "measured, no winner" when the honest answer is "cannot be measured yet".
  // That is exactly how someone decides an A/B test off nine payments.
  const minCell = Math.min(
    controlSuccessCount,
    controlSampleSize - controlSuccessCount,
    variantSuccessCount,
    variantSampleSize - variantSuccessCount
  );
  if (controlSampleSize + variantSampleSize < 50 || minCell < MIN_CELL_COUNT) {
    significance = "insufficient-data";
  } else if (pValue != null && pValue < 0.05) {
    significance = delta >= 0 ? "significant-lift" : "significant-regression";
  }

  return {
    method: "two-proportion",
    delta: round2(delta),
    pValue: pValue != null ? round2(pValue) : null,
    ciLow: ciLow != null ? round2(ciLow) : null,
    ciHigh: ciHigh != null ? round2(ciHigh) : null,
    significance,
  };
}

export function countDeltaSignal(controlCount: number, variantCount: number): StatisticalSignal {
  if (controlCount < 0 || variantCount < 0 || controlCount + variantCount === 0) {
    return {
      method: "count-delta",
      delta: 0,
      pValue: null,
      ciLow: null,
      ciHigh: null,
      significance: "insufficient-data",
    };
  }

  if (controlCount === 0 || variantCount === 0) {
    return {
      method: "count-delta",
      delta:
        controlCount === 0 ? 100 : round2(((variantCount - controlCount) / controlCount) * 100),
      pValue: null,
      ciLow: null,
      ciHigh: null,
      significance: "insufficient-data",
    };
  }

  const rateRatio = variantCount / controlCount;
  const logRateRatio = Math.log(rateRatio);
  const se = Math.sqrt(1 / controlCount + 1 / variantCount);
  const z = se > 0 ? logRateRatio / se : 0;
  const pValue = se > 0 ? clamp(2 * (1 - normalCdf(Math.abs(z))), 0, 1) : null;
  const ciLowRatio = Math.exp(logRateRatio - 1.96 * se);
  const ciHighRatio = Math.exp(logRateRatio + 1.96 * se);
  const delta = (rateRatio - 1) * 100;

  let significance: StatisticalSignificance = "inconclusive";
  if (controlCount + variantCount < 30) {
    significance = "insufficient-data";
  } else if (pValue != null && pValue < 0.05) {
    significance = delta >= 0 ? "significant-lift" : "significant-regression";
  }

  return {
    method: "count-delta",
    delta: round2(delta),
    pValue: pValue != null ? round2(pValue) : null,
    ciLow: round2((ciLowRatio - 1) * 100),
    ciHigh: round2((ciHighRatio - 1) * 100),
    significance,
  };
}

export function meanDifferenceSignal(
  controlSampleSize: number,
  controlMean: number,
  controlStddev: number,
  variantSampleSize: number,
  variantMean: number,
  variantStddev: number
): StatisticalSignal {
  if (
    controlSampleSize <= 1 ||
    variantSampleSize <= 1 ||
    controlMean < 0 ||
    variantMean < 0 ||
    controlStddev < 0 ||
    variantStddev < 0
  ) {
    return {
      method: "mean-difference",
      delta: 0,
      pValue: null,
      ciLow: null,
      ciHigh: null,
      significance: "insufficient-data",
    };
  }

  const controlVariance = (controlStddev * controlStddev) / controlSampleSize;
  const variantVariance = (variantStddev * variantStddev) / variantSampleSize;
  const se = Math.sqrt(controlVariance + variantVariance);
  const delta = variantMean - controlMean;
  const z = se > 0 ? delta / se : 0;
  const pValue = se > 0 ? clamp(2 * (1 - normalCdf(Math.abs(z))), 0, 1) : null;
  const ciLow = se > 0 ? delta - 1.96 * se : null;
  const ciHigh = se > 0 ? delta + 1.96 * se : null;

  let significance: StatisticalSignificance = "inconclusive";
  if (controlSampleSize + variantSampleSize < 40) {
    significance = "insufficient-data";
  } else if (pValue != null && pValue < 0.05) {
    significance = delta >= 0 ? "significant-lift" : "significant-regression";
  }

  return {
    method: "mean-difference",
    delta: round2(delta),
    pValue: pValue != null ? round2(pValue) : null,
    ciLow: ciLow != null ? round2(ciLow) : null,
    ciHigh: ciHigh != null ? round2(ciHigh) : null,
    significance,
  };
}

export function orientSignalToDirection(
  signal: StatisticalSignal,
  direction: "higher" | "lower"
): StatisticalSignal {
  if (direction === "higher") return signal;
  if (signal.significance === "significant-lift") {
    return { ...signal, significance: "significant-regression" };
  }
  if (signal.significance === "significant-regression") {
    return { ...signal, significance: "significant-lift" };
  }
  return signal;
}

export function formatSignalSummary(signal: StatisticalSignal, unit = "pp") {
  if (signal.significance === "insufficient-data") return "Insufficient sample";
  if (signal.ciLow == null || signal.ciHigh == null) return "Confidence unavailable";
  const deltaLabel = `${signal.delta >= 0 ? "+" : ""}${signal.delta}${unit}`;
  return `${deltaLabel} · 95% CI ${signal.ciLow >= 0 ? "+" : ""}${signal.ciLow} to ${
    signal.ciHigh >= 0 ? "+" : ""
  }${signal.ciHigh}${unit}`;
}
