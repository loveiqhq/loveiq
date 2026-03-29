export interface SegmentCondition {
  field:
    | "archetype"
    | "v5_archetype"
    | "gender"
    | "sexual_orientation"
    | "relationship_status"
    | "country"
    | "status"
    | "duration_ms"
    | "created_date_time"
    | "utm_source"
    | "utm_medium"
    | "has_report"
    | "has_payment";
  operator: "eq" | "neq" | "lt" | "gt" | "lte" | "gte" | "contains";
  value: string | number | boolean;
}

export interface SegmentRules {
  logic: "and" | "or";
  conditions: SegmentCondition[];
}

export interface SegmentComparableRow {
  id: number;
  status: string;
  duration_ms: number | null;
  created_date_time: string;
  utm_tracker: string | null;
  scoring_result: Array<{
    primary_archetype: string | null;
    v5_primary_archetype: string | null;
  }> | null;
  app_user: {
    user_profile: {
      gender: string | null;
      sexual_orientation: string | null;
      relationship_status: string | null;
      location_primary: string | null;
    } | null;
  } | null;
  personal_report: Array<{
    id: number;
    payment_id: number | null;
  }> | null;
}

export interface SegmentMetrics {
  total_submissions: number;
  completed: number;
  avg_duration_ms: number | null;
  archetype_distribution: Array<{ archetype: string; count: number }>;
}

interface ParsedUtm {
  utm_source: string | null;
  utm_medium: string | null;
}

export function parseUtmTracker(utmTracker: string | null): ParsedUtm {
  if (!utmTracker?.trim()) {
    return { utm_source: null, utm_medium: null };
  }

  try {
    const parsed = JSON.parse(utmTracker) as Record<string, unknown>;
    return {
      utm_source: typeof parsed.utm_source === "string" ? parsed.utm_source : null,
      utm_medium: typeof parsed.utm_medium === "string" ? parsed.utm_medium : null,
    };
  } catch {
    return { utm_source: utmTracker.trim(), utm_medium: null };
  }
}

function compareValues(
  actual: string | number | boolean | null,
  operator: SegmentCondition["operator"],
  expected: SegmentCondition["value"],
  field: SegmentCondition["field"]
): boolean {
  if (operator === "contains") {
    return (
      typeof actual === "string" && actual.toLowerCase().includes(String(expected).toLowerCase())
    );
  }

  if (typeof expected === "boolean") {
    if (typeof actual !== "boolean") return false;
    return operator === "eq" ? actual === expected : actual !== expected;
  }

  if (typeof expected === "number") {
    if (typeof actual !== "number") return false;
    switch (operator) {
      case "eq":
        return actual === expected;
      case "neq":
        return actual !== expected;
      case "lt":
        return actual < expected;
      case "gt":
        return actual > expected;
      case "lte":
        return actual <= expected;
      case "gte":
        return actual >= expected;
      default:
        return false;
    }
  }

  const actualValue =
    field === "created_date_time" && actual
      ? new Date(String(actual)).getTime()
      : String(actual ?? "").toLowerCase();
  const expectedValue =
    field === "created_date_time" ? new Date(expected).getTime() : String(expected).toLowerCase();

  switch (operator) {
    case "eq":
      return actualValue === expectedValue;
    case "neq":
      return actualValue !== expectedValue;
    case "lt":
      return typeof actualValue === "number" && typeof expectedValue === "number"
        ? actualValue < expectedValue
        : false;
    case "gt":
      return typeof actualValue === "number" && typeof expectedValue === "number"
        ? actualValue > expectedValue
        : false;
    case "lte":
      return typeof actualValue === "number" && typeof expectedValue === "number"
        ? actualValue <= expectedValue
        : false;
    case "gte":
      return typeof actualValue === "number" && typeof expectedValue === "number"
        ? actualValue >= expectedValue
        : false;
    default:
      return false;
  }
}

function getFieldValue(row: SegmentComparableRow, field: SegmentCondition["field"]) {
  const profile = row.app_user?.user_profile;
  const scoring = row.scoring_result?.[0];
  const utm = parseUtmTracker(row.utm_tracker);

  switch (field) {
    case "archetype":
      return scoring?.primary_archetype ?? null;
    case "v5_archetype":
      return scoring?.v5_primary_archetype ?? null;
    case "gender":
      return profile?.gender ?? null;
    case "sexual_orientation":
      return profile?.sexual_orientation ?? null;
    case "relationship_status":
      return profile?.relationship_status ?? null;
    case "country":
      return profile?.location_primary ?? null;
    case "status":
      return row.status;
    case "duration_ms":
      return row.duration_ms;
    case "created_date_time":
      return row.created_date_time;
    case "utm_source":
      return utm.utm_source;
    case "utm_medium":
      return utm.utm_medium;
    case "has_report":
      return (row.personal_report?.length ?? 0) > 0;
    case "has_payment":
      return (row.personal_report ?? []).some((report) => report.payment_id != null);
    default:
      return null;
  }
}

export function evaluateSegmentRules(row: SegmentComparableRow, rules: SegmentRules): boolean {
  if (!rules.conditions.length) return true;

  const results = rules.conditions.map((condition) =>
    compareValues(
      getFieldValue(row, condition.field),
      condition.operator,
      condition.value,
      condition.field
    )
  );

  return rules.logic === "and" ? results.every(Boolean) : results.some(Boolean);
}

export function buildSegmentMetrics(rows: SegmentComparableRow[]): SegmentMetrics {
  const archetypeMap = new Map<string, number>();
  let completed = 0;
  let durationTotal = 0;
  let durationCount = 0;

  for (const row of rows) {
    if (row.status === "completed") completed += 1;
    if (row.duration_ms != null && row.duration_ms > 0) {
      durationTotal += row.duration_ms;
      durationCount += 1;
    }
    const archetype = row.scoring_result?.[0]?.primary_archetype;
    if (archetype) {
      archetypeMap.set(archetype, (archetypeMap.get(archetype) ?? 0) + 1);
    }
  }

  return {
    total_submissions: rows.length,
    completed,
    avg_duration_ms: durationCount > 0 ? Math.round(durationTotal / durationCount) : null,
    archetype_distribution: [...archetypeMap.entries()]
      .map(([archetype, count]) => ({ archetype, count }))
      .sort((a, b) => b.count - a.count),
  };
}
