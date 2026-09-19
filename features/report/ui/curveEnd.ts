/**
 * The end point of an SVG path — where a "you are here" marker belongs.
 *
 * Three report charts draw the reader's own curve and park a dot at its end
 * (Insecurities, Energy & Risk, Arousal Style). A dot position maintained BESIDE
 * the path drifts the moment either one is edited, and silently: Insecurities
 * kept its `youY` as a three-branch lookup over five curves, so the depletion
 * family's dot floated 12px above its own line and the two riser families sat 2px
 * off. Reading the point off the path makes disagreement impossible, for every
 * variant and for any curve added later.
 *
 * Handles the commands these paths use — M / L / C / S / Q / T / A — whose last
 * two numbers are always the end coordinate. `H`, `V` and `Z` are not, so
 * `curveEndsWithPointCommand` exists to assert in tests that no path uses them,
 * rather than have this return a plausible wrong point at render time.
 */

/** Numbers in the path's final command, in order. */
function tailNumbers(d: string): number[] {
  const commands = d.trim().match(/[MmLlCcSsQqTtAaHhVvZz][^MmLlCcSsQqTtAaHhVvZz]*/g) ?? [];
  const last = commands[commands.length - 1] ?? "";
  return (last.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number);
}

/** Whether the path's last command is one whose final two numbers are its end point. */
export function curveEndsWithPointCommand(d: string): boolean {
  const commands = d.trim().match(/[MmLlCcSsQqTtAaHhVvZz]/g) ?? [];
  const last = commands[commands.length - 1];
  return !!last && /[MmLlCcSsQqTtAa]/.test(last) && tailNumbers(d).length >= 2;
}

/** The coordinate the path finishes on. Absolute commands only (all of ours are). */
export function curveEndPoint(d: string): { x: number; y: number } {
  const nums = tailNumbers(d);
  return { x: nums[nums.length - 2] ?? 0, y: nums[nums.length - 1] ?? 0 };
}
