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
 * nothing paid under the blur leaves the server. Flip it here and nothing else needs
 * to change; the chapters' gating tests pin this position.
 */
export type LockedBlurCopy = "real" | "decoy";

export const LOCKED_BLUR_COPY: LockedBlurCopy = "real";
