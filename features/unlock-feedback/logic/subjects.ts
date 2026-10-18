/**
 * The email's four subject lines, an equal split (Marcus's spec: A is the default, D the
 * personal one). The spec gives two preheaders, A and B; arm B, whose subject is the "one tap,
 * free" line, carries preheader B and every other arm preheader A.
 */

export const SUBJECT_ARMS = ["A", "B", "C", "D"] as const;

export type SubjectArm = (typeof SUBJECT_ARMS)[number];

export const PREHEADER_A = "Tap the reason you didn’t unlock it, and all 50+ pages are yours.";
export const PREHEADER_B = "No payment details. Your answer unlocks it.";

export function subjectFor(arm: SubjectArm, archetypeName: string): string {
  switch (arm) {
    case "A":
      return "Your full report is free. We just want to know one thing.";
    case "B":
      return "One tap, and your full LoveIQ report is yours, free";
    case "C":
      return "Tell us why you stopped, and we’ll unlock your report for free";
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
