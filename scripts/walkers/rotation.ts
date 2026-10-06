/**
 * Which persona walks run tonight.
 *
 * Every archetype on a phone and on a desktop is 28 walks. Four a night covers all of them
 * in a week, and the day number decides which four, so a rerun on the same day walks the
 * same four. The plan each walk buys rotates too, so every plan on sale gets bought every week.
 *
 *   npx tsx scripts/walkers/rotation.ts            # tonight's walks, as JSON
 */
import personasFile from "./personas.json";

/** WebKit on a phone and Chromium on a desktop: both engines, both layouts. */
export const DEVICES = ["iPhone 15 Pro", "Desktop Chrome"] as const;
export const PLANS = ["full_report", "core", "all_reports"] as const;
export type Plan = (typeof PLANS)[number];
/**
 * The plans the nightly walks buy: what staging sells. Pricing 3.0 (staging, 2026-10-05)
 * sells "All 14 Archetype Reports" and "Only Your Highest Archetype" and no longer core,
 * which a walk asked for by hand (`--plan core`) can still try where it is sold.
 */
export const ROTATION_PLANS: readonly Plan[] = ["full_report", "all_reports"];
export const WALKS_PER_NIGHT = 4;

export interface PlannedWalk {
  persona: string;
  device: string;
  plan: Plan;
  /** The report read: the default one loveiq.org shows, or Fatih's V4 (`?v4=1`). */
  report: "default" | "v4";
}

/**
 * Every persona on every device in `week`, each with the plan it buys. The plan moves on by
 * one every week, so each persona buys every plan on sale over as many weeks.
 */
export function allWalks(personas: string[], week = 0): Array<Omit<PlannedWalk, "report">> {
  return personas.flatMap((persona, i) =>
    DEVICES.map((device, j) => ({
      persona,
      device,
      plan: ROTATION_PLANS[(i + j + week) % ROTATION_PLANS.length]!,
    }))
  );
}

/**
 * Tonight's four. A night reads one report, the default and V4 on alternate nights, so each
 * persona on each device reads both, a week apart (the rotation repeats every 7 days, and 7
 * is odd).
 */
export function walksFor(at: Date, personas: string[]): PlannedWalk[] {
  const day = Math.floor(at.getTime() / 86_400_000);
  const all = allWalks(personas, Math.floor(day / 7));
  const report = day % 2 === 0 ? "default" : "v4";
  return Array.from({ length: WALKS_PER_NIGHT }, (_, k) => ({
    ...all[(day * WALKS_PER_NIGHT + k) % all.length]!,
    report,
  }));
}

if (process.argv[1]?.endsWith("rotation.ts")) {
  const personas = personasFile.personas.map((p) => p.archetype);
  console.log(JSON.stringify(walksFor(new Date(), personas)));
}
