/**
 * What a locked reader's page carries under the blur.
 *
 * "real" — the copy itself, exactly as far as the page draws it blurred: the trigger
 * rows under the lock, the rest of every gated passage, the fantasy rows and their
 * scores, the map's dots. Review 26.09 — Mark: "This should always be the unlocked
 * content but blurred"; Fatih chose it, with a stronger blur. A CSS blur is paint,
 * not protection (LockedPreviewImage.tsx): anyone can read this copy in the page
 * source, so it is a product decision, taken knowingly. What the page does not draw
 * — the fantasy rows past the ones shown, a locked row's shift or note — still never
 * leaves the server.
 *
 * "decoy" — scrambleLockedText's same-shape stand-ins, the rule from 23.09 to 26.09:
 * nothing paid under the blur leaves the server; the chapters' gating tests pin this
 * position. Flipping it back needs one thing more since 02.10: the thirteen archetypes
 * transcribed from Sanjin's docs (data/report3-copy) set most of their ramps' anchors to
 * null, where the wall starts a paragraph, so those ramp paragraphs would still go out
 * whole and real past their fade bands. Give each a fade-band anchor first, the way
 * Spark Seeker's were chosen.
 */
export type LockedBlurCopy = "real" | "decoy";

export const LOCKED_BLUR_COPY: LockedBlurCopy = "real";
