/**
 * Attachment-plane geometry per ATTACHMENT FAMILY (not per archetype).
 *
 * Mark's handoff README is explicit that chart geometry is deliberately `null` in
 * `archetype-config.json`: "chart geometry (curve shapes, dot coordinates, meter
 * values) is null in the config. That lives in the Figma components, not the
 * copy. Only the highlighted-curve or dot-position slot changes per archetype,
 * from the `families` value." So the plane is keyed by
 * `families.attachment` — exactly like `AROUSAL_CURVES` is keyed by arousal
 * family — and the designer shipped three scales covering all 14 archetypes:
 *
 *   SCALE 1 OF 3  secure-anxious   Figma 9108:549 — 7 of 14: Spiritual Lover,
 *                 Sensual Connector, Relational Nurturer, Radiant Performer,
 *                 Curious Apprentice, Loyal Ritualist, Tender Devotee.
 *                 ("Not a variant — this is the version already built into the
 *                 report", i.e. the coords previously stored ONLY under
 *                 `spiritual-lover.attachment_plane`.)
 *   SCALE 2 OF 3  secure-avoidant  Figma 9107:549 / plane 9107:520 — 6 of 14:
 *                 Spark Seeker, Explorer of Edges, Minimalist Companion,
 *                 Emotional Voyeur, Authority Conductor, Analytical Sexualist.
 *   SCALE 3 OF 3  avoidant         Figma 9107:571 / plane 9108:520 — 1 of 14:
 *                 Quiet Withdrawer.
 *
 * Before this file, `attachment_plane` existed for `spiritual-lover` only, so the
 * map rendered with no dots for 13 of 14 archetypes.
 *
 * COORDINATE SPACE: values are in the same authoring space the config used —
 * `ATTACHMENT_PLANE_SPACE` (520) in `app/api/report/route.ts`, which divides by it
 * to get the 0..1 fractions the client positions with. Figma's plane frames are
 * 440x440, so a Figma dot CENTRE converts as `centre * 520 / 440`. That is not an
 * assumption: SCALE 2's home centre (126.946, 314.746) converts to
 * (150.02, 371.97), reproducing the pre-existing `[150, 372]` to within a
 * rounding step — and the designer's own note on SCALE 2 reads "Same plane, same
 * home", which is why secure-anxious and secure-avoidant share `home`.
 *
 * Dot centres are derived from Figma as `x + width/2` on the 12.692px dot vectors.
 */

/** Raw (pre-normalization) plane, matching the `attachment_plane` config shape. */
export interface RawAttachmentPlane {
  /** [x, y] in the 520 authoring space. */
  home: [number, number];
  /** [x, y] in the 520 authoring space; null when there is no drift target. */
  strain: [number, number] | null;
  home_label: string;
  strain_label: string;
  accent_corner: "ANXIOUS" | "FEARFUL" | "SECURE" | "AVOIDANT";
  drift: string;
}

export const ATTACHMENT_PLANES: Record<string, RawAttachmentPlane> = {
  // SCALE 1 — secure home (bottom-left), anxious drift upward into ANXIOUS.
  // Verbatim the values that previously lived on `spiritual-lover`.
  "secure-anxious": {
    home: [150, 372],
    strain: [182, 176],
    home_label: "ORDINARY DAYS",
    strain_label: "UNDER DISCONNECTION",
    accent_corner: "SECURE",
    drift: "one-way",
  },

  // SCALE 2 — same secure home, but strain drifts SIDEWAYS into AVOIDANT
  // ("drifts sideways into self-containment rather than upward into anxiety").
  // Figma 9107:520 — home dot 9107:532 centre (126.946, 314.746) -> [150, 372];
  // strain dot 9107:534 centre (297.646, 310.846) -> [351.7, 367.3].
  "secure-avoidant": {
    home: [150, 372],
    strain: [351.7, 367.3],
    home_label: "ORDINARY DAYS",
    strain_label: "UNDER PRESSURE TO MERGE",
    accent_corner: "SECURE",
    drift: "one-way",
  },

  // SCALE 3 — avoidant-primary home (bottom-right), strain rises into FEARFUL
  // under sustained closeness. Figma 9108:520 — home dot 9108:532 centre
  // (329.846, 329.846) -> [389.7, 389.7]; strain dot 9108:534 centre
  // (349.846, 139.846) -> [413.4, 165.3].
  avoidant: {
    home: [389.7, 389.7],
    strain: [413.4, 165.3],
    home_label: "ORDINARY DAYS",
    strain_label: "UNDER SUSTAINED CLOSENESS",
    accent_corner: "AVOIDANT",
    drift: "one-way",
  },
};

/**
 * Plane for an attachment family. Returns null for an unknown/absent family so
 * the map still degrades to "no dots" rather than drawing invented geometry.
 */
export function getAttachmentPlaneForFamily(
  family: string | null | undefined
): RawAttachmentPlane | null {
  if (!family) return null;
  return Object.prototype.hasOwnProperty.call(ATTACHMENT_PLANES, family)
    ? (ATTACHMENT_PLANES[family] ?? null)
    : null;
}
