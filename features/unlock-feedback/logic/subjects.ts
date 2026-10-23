/**
 * The email's four subject lines, an equal split (Marcus's spec: A is the default, D the
 * personal one; kept as a test, Eman 22.10). A is Mark's line from the final canvas (22.10),
 * and C no longer says "stopped", which Mark found unclear in the body. The spec gives two
 * preheaders, A and B; arm B, whose subject is the "one tap, free" line, carries preheader B
 * and every other arm preheader A, which no longer promises "50+ pages" (Mark, 22.10).
 */

export const SUBJECT_ARMS = ["A", "B", "C", "D"] as const;

export type SubjectArm = (typeof SUBJECT_ARMS)[number];

export const PREHEADER_A = "Tap the reason you didn’t unlock it, and the full report is yours.";
export const PREHEADER_B = "No payment details. Your answer unlocks it.";

export function subjectFor(arm: SubjectArm, archetypeName: string): string {
  switch (arm) {
    case "A":
      return "Get your full report for free. We just want to know one thing.";
    case "B":
      return "One tap, and your full LoveIQ report is yours, free";
    case "C":
      return "Tell us why you didn’t unlock your report, and it’s yours for free";
    case "D":
      return `${archetypeName}, your full report is free for one answer`;
  }
}

export function preheaderFor(arm: SubjectArm): string {
  return arm === "B" ? PREHEADER_B : PREHEADER_A;
}

/** The admin's subject-test rows name each arm by its line, D with a stand-in for the name. */
export function subjectLabel(arm: SubjectArm): string {
  return subjectFor(arm, "[Archetype]");
}

export function isSubjectArm(value: unknown): value is SubjectArm {
  return typeof value === "string" && (SUBJECT_ARMS as readonly string[]).includes(value);
}

/** Each send draws its arm at random, so the four stay an equal split over any period. */
export function drawSubjectArm(random: () => number = Math.random): SubjectArm {
  return SUBJECT_ARMS[
    Math.min(SUBJECT_ARMS.length - 1, Math.floor(random() * SUBJECT_ARMS.length))
  ]!;
}
