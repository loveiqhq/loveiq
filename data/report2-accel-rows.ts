/**
 * Accelerators & Brakes — the ten ranked trigger rows and the accelerator/brake
 * verdict meter, transcribed from Figma `8946:4286`
 * ("Section - ACCELERATORS & BRAKES — final: A1 + verdict meter").
 *
 * WHY THIS IS HARDCODED: these rows are NOT in Mark's copy handoff. Its `accel`
 * section carries exactly nine slots (`gate.hook`, `takeaway`, `edu.*`,
 * `learn.*`) and no row or meter data, so `AcceleratorsSection` previously
 * rendered the card, verdict line and educational block but deliberately omitted
 * the rows rather than invent them. Hardcoding this section was explicitly
 * approved (2026-08-12) so it can match the design now instead of waiting on a
 * per-archetype copy pass.
 *
 * SCOPE OF THE DATA: every archetype gets its OWN rows — Spiritual Lover's text is
 * never shown to anyone else.
 *   - `spiritual-lover` uses the Figma set verbatim (it is the archetype Figma
 *     mocks), so the design reference still matches pixel for pixel.
 *   - The other 13 are derived from that archetype's own production prose in
 *     `data/report-archetypes.ts`: `turn_ons` supplies the five "opens" labels and
 *     `turn_offs` the five "shuts", each with the first sentence of its own
 *     description as the subtext (lower-cased to match Figma's fragment style).
 *     These are the team's words, not generated copy. Every archetype has 10
 *     turn-ons and 8 turn-offs, so all 14 resolve five of each.
 * Ordering is the prose order, which the copy itself treats as rank — e.g.
 * Relational Nurturer's `takeaway` reads "Remove the coldness and the sense of
 * being taken for granted", naming rows 1 and 2 of its own brake list.
 * The `verdict` meter stays the Figma one for now: it is not archetype-named text,
 * and `edu.body.p2` puts ~6 in 10 users on the brake-led side.
 *
 * GEOMETRY: `fill` is the bar width as a percentage of Figma's 403.99px track —
 * each one divides exactly (e.g. 371.67 / 403.99 = 92.0%). The verdict `dot` is
 * the marker centre over its 800.81px track (576.57 / 800.81 = 72.0%). Rows are
 * listed in Figma's order, which is also descending rank.
 */

export interface AccelRow {
  label: string;
  subtext: string;
  /** Bar width as a percentage (0-100) of the row track. */
  fill: number;
}

export interface AccelVerdict {
  /** Marker centre as a percentage (0-100) across the accelerator→brake track. */
  dot: number;
  /** The side the reader leans, emphasised inside `caption`. */
  side: string;
  /** Full sentence; `side` is bolded where it occurs. */
  caption: string;
}

export interface AccelRowData {
  opens: AccelRow[];
  shuts: AccelRow[];
  verdict: AccelVerdict;
}

/** Figma 8946:4301 — "▲ What opens you". */
const FIGMA_OPENS: AccelRow[] = [
  { label: "Intention setting", subtext: "a shared pause before touching", fill: 92 },
  { label: "Ritual touch", subtext: "slow, whole-body, worship not grabbing", fill: 84 },
  { label: "Eye gazing", subtext: "soft contact that calms, not pressures", fill: 76 },
  { label: "Emotional release", subtext: "tears or trembling welcomed, not managed", fill: 70 },
  { label: "After-sex integration", subtext: "staying close while the energy settles", fill: 64 },
];

/** Figma 8946:4339 — "▼ What shuts you down". */
const FIGMA_SHUTS: AccelRow[] = [
  { label: "Unrepaired conflict", subtext: "sex can't bypass what words haven't fixed", fill: 94 },
  { label: "Mechanical pacing", subtext: "body engaged, heart absent", fill: 85 },
  { label: "Distraction", subtext: "phones, rushing, intimacy between tasks", fill: 77 },
  { label: "Crude tone", subtext: "jokes that break the mood mid-opening", fill: 66 },
  { label: "No landing", subtext: "immediate separation after sex", fill: 58 },
];

/** Figma 8946:4377 — the verdict meter. */
const FIGMA_VERDICT: AccelVerdict = {
  dot: 72,
  side: "brake-led",
  caption: "Your system is brake-led — always start by releasing, not adding.",
};

const FALLBACK: AccelRowData = {
  opens: FIGMA_OPENS,
  shuts: FIGMA_SHUTS,
  verdict: FIGMA_VERDICT,
};

/** Rows per archetype slug. Spiritual Lover is the Figma set; the rest are derived
 *  from their own `turn_ons` / `turn_offs` prose (see the header note). */
export const ACCEL_ROWS_BY_SLUG: Record<string, AccelRowData> = {
  "spiritual-lover": FALLBACK,
  "spark-seeker": {
    opens: [
      {
        label: "Playful teasing",
        subtext: "banter that builds tension instead of going straight to sex",
        fill: 92,
      },
      {
        label: "Flirt + pursuit energy",
        subtext: "being approached with confidence and fun",
        fill: 84,
      },
      {
        label: "Novelty triggers",
        subtext: "a new setting (different room, hotel, shower, car makeout)",
        fill: 76,
      },
      {
        label: "Visual + style cues",
        subtext: 'lingerie, outfits, or "getting ready" as part of the turn-on',
        fill: 70,
      },
      {
        label: "Playful challenge",
        subtext: 'light competition: "Bet I can make you lose control"',
        fill: 64,
      },
    ],
    shuts: [
      {
        label: "Predictable, duty-like sex",
        subtext: "moving through the same script every time",
        fill: 94,
      },
      {
        label: "Heavy seriousness right before intimacy",
        subtext: "long, serious talks immediately before trying to be sexual",
        fill: 85,
      },
      {
        label: "No flirt energy",
        subtext: "initiation that's flat, polite, or overly practical",
        fill: 77,
      },
      {
        label: "Over-control or micromanaging",
        subtext: "too many rules mid-moment. Being corrected constantly instead of flirted with",
        fill: 66,
      },
      {
        label: "Low responsiveness",
        subtext: "a partner who doesn't react, engage, or mirror desire",
        fill: 58,
      },
    ],
    verdict: FIGMA_VERDICT,
  },
  "sensual-connector": {
    opens: [
      {
        label: "Slow build-up",
        subtext: "letting things unfold over time instead of jumping into sex",
        fill: 92,
      },
      {
        label: "Extended touch",
        subtext: "long hugs. Sitting close with bodies touching",
        fill: 84,
      },
      {
        label: "Deep kissing",
        subtext: "slow, connected kissing. Kissing that pauses and resumes",
        fill: 76,
      },
      {
        label: "Skin-to-skin contact",
        subtext: "lying naked or partially naked together",
        fill: 70,
      },
      { label: "Eye contact", subtext: "looking at each other before touching", fill: 64 },
    ],
    shuts: [
      {
        label: "Being rushed into sex",
        subtext: "moving quickly toward penetration without warm-up",
        fill: 94,
      },
      {
        label: "Lack of emotional attunement",
        subtext: "no checking in emotionally before touching",
        fill: 85,
      },
      { label: "Partner on autopilot", subtext: "phone use before or during intimacy", fill: 77 },
      {
        label: "Porn-style speed or friction",
        subtext: "fast, repetitive movements without sensitivity",
        fill: 66,
      },
      {
        label: "Emotional rupture right before intimacy",
        subtext: "sarcasm. Criticism. Coldness or withdrawal",
        fill: 58,
      },
    ],
    verdict: FIGMA_VERDICT,
  },
  "relational-nurturer": {
    opens: [
      {
        label: "Warm emotional check-in",
        subtext: "being asked how they're really doing before intimacy",
        fill: 92,
      },
      {
        label: "Caring, attentive touch",
        subtext: "touch that feels soothing, not demanding",
        fill: 84,
      },
      {
        label: "Connected kissing",
        subtext: "kissing that feels affectionate, not performative",
        fill: 76,
      },
      { label: "Full-body safety cues", subtext: "cuddling first, clothes on, no rush", fill: 70 },
      {
        label: "Reassuring eye contact",
        subtext: "looking at each other before things intensify",
        fill: 64,
      },
    ],
    shuts: [
      {
        label: "Emotional coldness",
        subtext: "no warmth, affection, or tenderness leading into intimacy",
        fill: 94,
      },
      {
        label: "Being taken for granted",
        subtext: "assuming they'll always be available",
        fill: 85,
      },
      { label: "Selfish sex", subtext: "partner focusing only on their own pleasure", fill: 77 },
      { label: "Contempt or criticism", subtext: "snapping, sarcasm, or eye-rolling", fill: 66 },
      {
        label: "Pressure to perform caretaking",
        subtext: "being expected to soothe, fix, or reassure during intimacy",
        fill: 58,
      },
    ],
    verdict: FIGMA_VERDICT,
  },
  "radiant-performer": {
    opens: [
      {
        label: "Being watched",
        subtext: "a partner openly watching them undress or move",
        fill: 92,
      },
      {
        label: "Visible appreciation",
        subtext: "strong reactions: sounds, facial expressions, grabbing closer",
        fill: 84,
      },
      {
        label: "Performing and teasing",
        subtext: "a slow strip, a dance, or playful posing",
        fill: 76,
      },
      {
        label: "Visual enhancement",
        subtext: 'lingerie, costumes, heels, accessories, a "look"',
        fill: 70,
      },
      {
        label: "Locked-in eye contact",
        subtext: 'eye contact that says "I\'m impressed"',
        fill: 64,
      },
    ],
    shuts: [
      { label: "Indifference", subtext: "a partner who seems bored or distracted", fill: 94 },
      {
        label: "Critical comments or body shame",
        subtext: "jokes about their body, performance, or style",
        fill: 85,
      },
      {
        label: "Flat affect during sex",
        subtext: "silent, expressionless participation",
        fill: 77,
      },
      {
        label: "Being rushed without buildup",
        subtext: 'initiation that skips the "being wanted" phase',
        fill: 66,
      },
      {
        label: "Awkwardness that isn't handled kindly",
        subtext: "visible discomfort from the partner",
        fill: 58,
      },
    ],
    verdict: FIGMA_VERDICT,
  },
  "explorer-of-edges": {
    opens: [
      {
        label: "Negotiated intensity",
        subtext: "clear consent and a shared plan before things escalate",
        fill: 92,
      },
      {
        label: "Power exchange clarity",
        subtext: "defined roles (who leads, who yields) for the encounter",
        fill: 84,
      },
      {
        label: "Taboo charge",
        subtext: "darker fantasies that stay consensual and contained",
        fill: 76,
      },
      {
        label: "Strong sensation",
        subtext: "intense touch that's deliberate and earned",
        fill: 70,
      },
      {
        label: "Eye contact under power",
        subtext: "being made to hold eye contact at key moments",
        fill: 64,
      },
    ],
    shuts: [
      {
        label: "Routine, low-charge sex",
        subtext: "replaying the same safe script with no edge",
        fill: 94,
      },
      { label: "Consent ambiguity", subtext: "assuming instead of asking", fill: 85 },
      {
        label: "Judgment or moral condemnation",
        subtext: "shaming their fantasies or desires",
        fill: 77,
      },
      {
        label: "Timid, ungrounded intensity",
        subtext: "trying to be intense but feeling unsure or sloppy",
        fill: 66,
      },
      {
        label: "Breaking the container",
        subtext: "interruptions, phones, or casual vibe during edge play",
        fill: 58,
      },
    ],
    verdict: FIGMA_VERDICT,
  },
  "curious-apprentice": {
    opens: [
      {
        label: "A clear invitation to explore",
        subtext: 'being told "let\'s try something" in a calm, confident way',
        fill: 92,
      },
      {
        label: "Guidance and demonstration",
        subtext: "a partner showing them how, step by step",
        fill: 84,
      },
      {
        label: "Curious kissing",
        subtext: "trying different styles of kissing on purpose",
        fill: 76,
      },
      {
        label: "Tools for learning",
        subtext: 'trying toys or accessories as "experiments," not performance',
        fill: 70,
      },
      {
        label: "Eye contact + check-ins",
        subtext: 'eye contact that asks, "Are you with me?"',
        fill: 64,
      },
    ],
    shuts: [
      {
        label: "Ridicule or embarrassment",
        subtext: "laughing at their attempts in a mean way",
        fill: 94,
      },
      { label: "Impatience", subtext: "rushing them when they need time to learn", fill: 85 },
      {
        label: "Vague or confusing feedback",
        subtext: "hints instead of clear guidance",
        fill: 77,
      },
      {
        label: "Over-instruction that feels like critique",
        subtext: "constant correcting with a sharp tone",
        fill: 66,
      },
      {
        label: "Fear-based pressure",
        subtext: "threats of disappointment or withdrawal",
        fill: 58,
      },
    ],
    verdict: FIGMA_VERDICT,
  },
  "tender-devotee": {
    opens: [
      {
        label: "Praise up front",
        subtext: "being told they're sexy before anything even starts",
        fill: 92,
      },
      {
        label: "Positive feedback during touch",
        subtext: "hearing what the partner likes in real time",
        fill: 84,
      },
      {
        label: "Kissing that confirms desire",
        subtext: "kissing that feels hungry and intentional",
        fill: 76,
      },
      {
        label: "Focused attention",
        subtext: "being touched like the partner is truly interested",
        fill: 70,
      },
      {
        label: "Admiring eye contact",
        subtext: "eye contact that feels approving and warm",
        fill: 64,
      },
    ],
    shuts: [
      {
        label: "Criticism",
        subtext: "negative comments about their body or performance",
        fill: 94,
      },
      { label: "Indifference", subtext: "a partner who seems bored or distracted", fill: 85 },
      { label: "Comparison", subtext: 'references to porn, exes, or "how others do it"', fill: 77 },
      {
        label: "Mixed signals",
        subtext: "flirting then pulling away without explanation",
        fill: 66,
      },
      {
        label: "Pressure to perform",
        subtext: "being expected to act confident when they don't feel it",
        fill: 58,
      },
    ],
    verdict: FIGMA_VERDICT,
  },
  "authority-conductor": {
    opens: [
      {
        label: "Taking the lead",
        subtext: "initiating with authority and calm certainty",
        fill: 92,
      },
      {
        label: "Protocol and structure",
        subtext: "a clear agreement about roles before things begin",
        fill: 84,
      },
      { label: "Directed kissing", subtext: "kissing that's guided and controlled", fill: 76 },
      {
        label: "Positioning and containment",
        subtext: "placing hands, body, or posture with intention",
        fill: 70,
      },
      {
        label: "Eye contact as permission",
        subtext: 'eye contact that tests surrender: "Are you with me?"',
        fill: 64,
      },
    ],
    shuts: [
      {
        label: "Chaotic initiation",
        subtext: "starting intimacy with no structure or clarity",
        fill: 94,
      },
      {
        label: "Resistance without communication",
        subtext: "passive resistance instead of honest boundaries",
        fill: 85,
      },
      { label: "Disrespect or sarcasm", subtext: "mocking their leadership or desires", fill: 77 },
      {
        label: "Consent ambiguity",
        subtext: "assuming consent instead of confirming it",
        fill: 66,
      },
      {
        label: "Partner's lack of presence",
        subtext: "distraction, phones, or half-attention",
        fill: 58,
      },
    ],
    verdict: FIGMA_VERDICT,
  },
  "analytical-sexualist": {
    opens: [
      {
        label: "A clear plan",
        subtext: "knowing what the intention is (slow, intense, playful, focused)",
        fill: 92,
      },
      {
        label: "Technique + experimentation",
        subtext: "trying a method or position with clear instruction",
        fill: 84,
      },
      {
        label: "Purposeful kissing",
        subtext: "kissing as a deliberate warm-up, not random",
        fill: 76,
      },
      {
        label: "Optimization tools",
        subtext: "pillows, props, lube, anything that improves outcomes",
        fill: 70,
      },
      {
        label: "Eye contact as a check-in",
        subtext: 'eye contact that asks, "Is this working?"',
        fill: 64,
      },
    ],
    shuts: [
      { label: "Vague communication", subtext: "hints instead of direct requests", fill: 94 },
      {
        label: "Constant changing mid-moment",
        subtext: "switching pace, position, or preference repeatedly",
        fill: 85,
      },
      {
        label: "Emotional volatility",
        subtext: "anger, tears, or conflict erupting mid-intimacy",
        fill: 77,
      },
      {
        label: "Messy, distracting environment",
        subtext: "interruptions, noise, clutter, uncomfortable conditions",
        fill: 66,
      },
      {
        label: "Porn-script expectations",
        subtext: "performative pacing instead of responsive touch",
        fill: 58,
      },
    ],
    verdict: FIGMA_VERDICT,
  },
  "emotional-voyeur": {
    opens: [
      { label: "Watching", subtext: "seeing a partner touch themselves (with consent)", fill: 92 },
      {
        label: "Fantasy narrative",
        subtext: "slow build-up in the mind before anything happens",
        fill: 84,
      },
      { label: "Teasing buildup", subtext: "being told what will happen later", fill: 76 },
      { label: "Partner on display", subtext: "a partner performing for them privately", fill: 70 },
      {
        label: "Eye contact from a safe distance",
        subtext: "glances that invite observation without demanding closeness",
        fill: 64,
      },
    ],
    shuts: [
      {
        label: "Being pushed to perform",
        subtext: 'pressure to "do more" or be more expressive',
        fill: 94,
      },
      {
        label: "Forced intensity or closeness",
        subtext: "demanding eye contact or emotional intensity on cue",
        fill: 85,
      },
      { label: "Judgment of fantasies", subtext: "mocking what turns them on mentally", fill: 77 },
      {
        label: "Exposure risks",
        subtext: "lack of privacy, interruptions, or fear of being overheard",
        fill: 66,
      },
      {
        label: "Pressure to narrate everything",
        subtext: "being demanded to talk dirty or explain arousal",
        fill: 58,
      },
    ],
    verdict: FIGMA_VERDICT,
  },
  "loyal-ritualist": {
    opens: [
      {
        label: "Planned intimacy",
        subtext: "knowing there's a dedicated time for closeness",
        fill: 92,
      },
      {
        label: "Familiar sequence",
        subtext: "a predictable order: cuddle → kiss → touch → more",
        fill: 84,
      },
      {
        label: "Known kissing style",
        subtext: "kissing that starts in the same comforting way",
        fill: 76,
      },
      {
        label: "Comfort-based closeness",
        subtext: "same bed, same cozy setup, same warm lighting",
        fill: 70,
      },
      {
        label: "Eye contact as ritual",
        subtext: 'a familiar look that signals "it\'s our time"',
        fill: 64,
      },
    ],
    shuts: [
      { label: "Inconsistency", subtext: "hot-and-cold initiation patterns", fill: 94 },
      {
        label: "Last-minute changes",
        subtext: "building anticipation and then canceling casually",
        fill: 85,
      },
      { label: "Novelty pressure", subtext: "being pushed to reinvent sex constantly", fill: 77 },
      {
        label: "Unclear commitment cues",
        subtext: "flirtation that feels ambiguous or inconsistent",
        fill: 66,
      },
      {
        label: "Distracted presence",
        subtext: "phones and interruptions during their ritual time",
        fill: 58,
      },
    ],
    verdict: FIGMA_VERDICT,
  },
  "minimalist-companion": {
    opens: [
      { label: "No-pressure intimacy", subtext: "knowing sex is optional, not expected", fill: 92 },
      {
        label: "Simple touch",
        subtext: "a hand on the thigh, back, or waist, no urgency",
        fill: 84,
      },
      { label: "Easy kissing", subtext: "kissing that's sweet and uncomplicated", fill: 76 },
      {
        label: "Comfortable closeness",
        subtext: "spooning under blankets. Lazy, warm skin contact with minimal effort",
        fill: 70,
      },
      {
        label: "Gentle eye contact",
        subtext: "soft eye contact that feels friendly and safe",
        fill: 64,
      },
    ],
    shuts: [
      {
        label: "Overly elaborate buildup",
        subtext: 'too many steps, plans, or "special" requirements',
        fill: 94,
      },
      {
        label: "High-intensity escalation",
        subtext: "going from zero to intense quickly",
        fill: 85,
      },
      {
        label: "Emotional drama in the moment",
        subtext: "big emotional conversations right before sex",
        fill: 77,
      },
      { label: "Novelty pressure", subtext: "being pushed to try new things constantly", fill: 66 },
      {
        label: "Cluttered, distracting environment",
        subtext: "noise, mess, bright lights, or uncomfortable temperature",
        fill: 58,
      },
    ],
    verdict: FIGMA_VERDICT,
  },
  "quiet-withdrawer": {
    opens: [
      { label: "Zero pressure", subtext: "knowing they can say no without consequences", fill: 92 },
      {
        label: "Soft, minimal touch",
        subtext: "gentle cuddling without immediate escalation",
        fill: 84,
      },
      {
        label: "Gentle kissing",
        subtext: "light kissing that doesn't rush into intensity",
        fill: 76,
      },
      {
        label: "Cocoon closeness",
        subtext: "warm blankets, spooning, a protected feeling",
        fill: 70,
      },
      {
        label: "Eye contact (optional)",
        subtext: "not being forced into intense eye contact",
        fill: 64,
      },
    ],
    shuts: [
      { label: "Pressure to engage", subtext: "initiation that feels like a demand", fill: 94 },
      {
        label: "Overstimulation",
        subtext: "too much speed, noise, or intensity too soon",
        fill: 85,
      },
      {
        label: "Emotional tension in the room",
        subtext: "coldness, irritation, or unresolved conflict",
        fill: 77,
      },
      {
        label: "Intrusive touch",
        subtext: "grabbing without warm-up. Touch that doesn't track their responses",
        fill: 66,
      },
      { label: "Being interrogated", subtext: "too many questions about what's wrong", fill: 58 },
    ],
    verdict: FIGMA_VERDICT,
  },
};

/** Rows for an archetype slug, falling back to the single Figma set. */
export function getAccelRows(slug: string | null | undefined): AccelRowData {
  if (slug && Object.prototype.hasOwnProperty.call(ACCEL_ROWS_BY_SLUG, slug)) {
    return ACCEL_ROWS_BY_SLUG[slug] ?? FALLBACK;
  }
  return FALLBACK;
}
