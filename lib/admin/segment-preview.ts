export function hasSegmentConditionValue(
  value: string | number | boolean | null | undefined
): boolean {
  return value !== "" && value !== null && value !== undefined;
}
