import { describe, expect, it } from "vitest";
import { hasSegmentConditionValue } from "../../lib/admin/segment-preview";

describe("segment preview helpers", () => {
  it("treats false and zero as valid condition values", () => {
    expect(hasSegmentConditionValue(false)).toBe(true);
    expect(hasSegmentConditionValue(0)).toBe(true);
  });

  it("treats empty values as missing", () => {
    expect(hasSegmentConditionValue("")).toBe(false);
    expect(hasSegmentConditionValue(null)).toBe(false);
    expect(hasSegmentConditionValue(undefined)).toBe(false);
  });
});
