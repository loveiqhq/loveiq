/**
 * The three loop steps shown as connected chips in Libido Challenges
 * (Figma 8427:2593 base "The Waiting Loop", 9114:546 variant "The Novelty Loop").
 *
 * The variant's footer states the contract: "one spine serves all 14 — and the
 * same spine is used by Challenges in Partnership. Every archetype has its own
 * named loop, three rows and three steps." The loop NAME already exists for all
 * 14 as `libido.result` ("The Harmony Loop", "The Dimming Loop", …) and the rows
 * as `row1..row4`, but the three STEPS existed nowhere: config `loop` covered
 * only 3 of 14, and even those rendered rows 1–3 again, so the chips repeated
 * verbatim the text printed directly beneath them.
 *
 * Figma's steps are a distinct three-beat arc — the starting condition, the
 * mechanism that drains it, then the self-doubt that restarts it — not a copy of
 * the diagnostic rows. Spiritual Lover and Spark Seeker are Figma verbatim; the
 * other 12 are written to that arc from THAT archetype's own `row1`/`row2`/
 * `row3` copy, whose mechanism sentence is quoted above each entry so the
 * phrasing can be checked against its source. Register follows the two Figma
 * sets: "<setup> — <consequence>", roughly six to eleven words, no full stop.
 */

export type LibidoLoopSteps = [string, string, string];

export const LIBIDO_LOOP_STEPS: Record<string, LibidoLoopSteps> = {
  // Figma 8427:2596/2598/2600 — verbatim.
  "spiritual-lover": [
    "Daily life feels ordinary — not sacred, not inviting",
    "You wait for the right mood — it rarely arrives on its own",
    "Chances pass, doubt grows — and tomorrow looks like today",
  ],

  // Figma 9114:549/551/553 — verbatim.
  "spark-seeker": [
    "Desire spikes fast — novelty, pursuit, anticipation",
    "Predictability sets in — stimulation drops, attraction doesn't",
    "You disengage and doubt yourself — “too restless to commit”",
  ],

  // "You say yes to keep the peace, but you're not really present; sex starts to
  // feel empty; your desire fades."
  "sensual-connector": [
    "You say yes to keep the peace — harmony first, wanting second",
    "Presence thins while the sex continues — appetite quietly drains",
    "You question your love — instead of the missing yes",
  ],

  // "You give more to steady the bond; your own needs go unspoken; resentment
  // builds quietly; desire fades under the weight."
  "relational-nurturer": [
    "You give more to steady the bond — your own needs go unspoken",
    "Resentment builds under the carrying — desire sinks beneath it",
    "You ask why you hold it all — then give more again",
  ],

  // "Praise and visible desire fade with familiarity; your body reads the quiet
  // as 'no longer wanted'; you perform harder."
  "radiant-performer": [
    "Desire runs bright while the attention is loud",
    "Familiarity quiets the praise — your body reads it as unwanted",
    "You perform harder to be seen — and feel it less",
  ],

  // "You soften your edge to keep the peace or dodge judgment; the toned-down
  // version bores you; boredom reads as low desire."
  "explorer-of-edges": [
    "You soften your edge — to keep the peace or dodge judgment",
    "The toned-down version bores you — boredom reads as low desire",
    "You doubt your own wanting — “only when it's intense”",
  ],

  // "You watch yourself instead of feeling; the watching kills arousal; you read
  // that as failing; so next time you watch harder."
  "curious-apprentice": [
    "Sex starts and your mind steps in to check how you are doing",
    "Watching replaces feeling — the watching kills the arousal",
    "You read it as failing — so next time you watch harder",
  ],

  // "Pressure or intensity rises; your body braces instead of opening; you read
  // the shutdown as being broken; so the pressure grows."
  "minimalist-companion": [
    "Pressure or intensity rises — more than the moment needs",
    "Your body braces instead of opening — effort replaces ease",
    "You read the shutdown as broken — and the pressure grows",
  ],

  // "Sex starts to demand quick participation or exposure; your body guards; you
  // slip back into fantasy where it's safe."
  "emotional-voyeur": [
    "Desire runs vivid in your head — safe, unwatched, yours",
    "Sex asks you to be seen — your body guards the door",
    "You slip back into fantasy — and the gap widens",
  ],

  // "Respect slips or the polarity flattens; your body reads it as unsafe; you
  // grip the frame tighter to steady it."
  "authority-conductor": [
    "Desire runs strong while the frame is clean",
    "Respect slips or the polarity flattens — your body reads unsafe",
    "You grip the frame tighter — and charge hardens into control",
  ],

  // "A chaotic stretch disrupts your rhythm; your body stops warming up; you read
  // that as low desire; you brace harder."
  "loyal-ritualist": [
    "The rhythm you rely on breaks — a chaotic stretch, a changed plan",
    "Your body stops warming up — the familiar cue never comes",
    "You read it as low desire — and brace harder against the change",
  ],

  // "You agree to keep the peace; your own wants go unspoken; compliance dulls
  // desire; the numbness scares you, so you please harder."
  "tender-devotee": [
    "You agree to keep the peace — your own wants go unspoken",
    "Compliance dulls the wanting — numbness arrives in its place",
    "The numbness frightens you — so you please harder",
  ],

  // "You troubleshoot to make it go well; the troubleshooting pulls you out of
  // your body; the flatness reads as a problem to solve."
  "analytical-sexualist": [
    "Things start and your attention goes to the mechanics",
    "Troubleshooting pulls you out of your body — flatness follows",
    "You read the flatness as a problem — and troubleshoot harder",
  ],

  // "Pressure rises; your body shuts down to cope; you pull away to feel safe;
  // your partner feels rejected and moves closer."
  "quiet-withdrawer": [
    "Something starts to feel like pressure — however gently it arrives",
    "Your body shuts down to cope — you pull away to feel safe",
    "Your partner moves closer — and the pressure rises again",
  ],
};

/** The three loop steps for an archetype slug, or null when unknown. */
export function getLibidoLoopSteps(slug: string | null | undefined): LibidoLoopSteps | null {
  return (slug && LIBIDO_LOOP_STEPS[slug]) || null;
}
