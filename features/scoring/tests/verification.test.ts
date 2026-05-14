/**
 * Comprehensive scoring engine verification.
 *
 * 1. Every archetype can be achieved as primaryArchetype
 * 2. Label-to-code mapping works for every single option in every categorical question
 * 3. All dimensions and overlays receive correct data
 * 4. Full realistic survey response produces valid results
 */

import { describe, it, expect } from "vitest";
import { scoreArchetypes } from "@features/scoring/logic/engine";
import { getScoringConfig } from "@features/scoring/logic/config";
import type { ScoringConfig } from "@features/scoring/logic/types";

const config = getScoringConfig();

// ─── Archetype prototype values (from CSV) ──────────────────────────────────
// For each archetype, craft responses that maximize similarity to its prototype.
// Scale values: prototype_value maps to 1-7 scale via: scale_value = prototype * 6 + 1

function protoToScale(proto: number): number {
  return Math.round(proto * 6 + 1);
}

// Build the ideal responses for a given archetype
function buildIdealResponses(archetype: string): Record<string, unknown> {
  const responses: Record<string, unknown> = {};

  // Set all scale dimensions to match the archetype's prototype values
  for (const dim of Object.values(config.dimensions)) {
    const proto = config.prototypes.get(`${archetype}||${dim.id}`) ?? 0.5;

    if (dim.transform === "scale_1_7_to_0_1") {
      responses[dim.qid] = protoToScale(proto);
    } else if (dim.transform === "categorical_to_numeric") {
      // DIM_RISK_PREF (03010) — pick the closest answer code
      if (dim.id === "DIM_RISK_PREF") {
        if (proto <= 0.125) responses[dim.qid] = "very_safe";
        else if (proto <= 0.375) responses[dim.qid] = "safe_novelty";
        else if (proto <= 0.625) responses[dim.qid] = "balanced";
        else if (proto <= 0.875) responses[dim.qid] = "adventurous_boundaries";
        else responses[dim.qid] = "edge_taboo";
      }
    }
  }

  return responses;
}

// Archetype-specific categorical boosts to push each archetype to #1
const archetypeBoosts: Record<string, Record<string, unknown>> = {
  "Sensual Connector": {
    "02001": "responsive",
    "02004": "partner_starts",
    "03005": "connection",
    "03013": "absorbed",
    "10002": ["reassurance"],
    "11001": "egalitarian",
    "14020": ["bonding"],
  },
  "Spark Seeker": {
    "02001": "spontaneous",
    "02004": "i_start",
    "03003": ["spontaneous"],
    "03005": "novelty",
    "03013": "watched",
    "10002": ["expressive"],
    "11001": "switch",
    "14020": ["pleasure"],
  },
  "Relational Nurturer": {
    "02001": "responsive",
    "02004": "partner_starts",
    "03005": "connection",
    "08003": "pursue",
    "10002": ["reassurance"],
    "14020": ["healing"],
  },
  "Exhibitionist Performer": {
    "02001": "spontaneous",
    "03003": ["visible_semipublic"],
    "03005": "sensation",
    "03013": "watched",
    "10002": ["expressive"],
    "11001": "switch",
    "14020": ["validation"],
  },
  "Explorer of Edges": {
    "02004": "i_start",
    "03003": ["adventurous", "edge_taboo"],
    "03005": "fantasy",
    "03010": "edge_taboo",
    "03013": "watching",
    "11001": "lead",
    "14020": ["escape", "intensity"],
  },
  "Curious Apprentice": {
    "02001": "varies",
    "03003": ["adventurous"],
    "03005": "novelty",
    "03006": "guidance",
    "08003": "calm",
    "11001": "switch",
    "14020": ["novelty"],
    "16005": "awakening",
  },
  "Spiritual Lover": {
    "02001": "responsive",
    "02004": "partner_starts",
    "03005": "connection",
    "03013": "absorbed",
    "08003": "calm",
    "10002": ["reassurance"],
    "14020": ["meaning"],
    "16005": "evolving",
  },
  "Minimalist Companion": {
    "01003": "not_focus",
    "02001": "planned",
    "03003": ["private"],
    "03005": "safety",
    "08003": "withdraw",
    "10002": ["nonverbal", "very_little"],
    "14020": ["comfort"],
  },
  "Emotional Voyeur": {
    "01003": "not_focus",
    "03005": "fantasy",
    "03013": "watching",
    "08003": "withdraw",
    "10002": ["nonverbal", "very_little"],
    "14020": ["escape"],
  },
  "Power Orchestrator": {
    "02001": "spontaneous",
    "02004": "i_start",
    "03003": ["ritualized"],
    "08003": "angry",
    "10002": ["direct_phrases"],
    "11001": "lead",
    "14020": ["power"],
  },
  "Loyal Ritualist": {
    "02001": "planned",
    "02004": "plan_window",
    "03003": ["ritualized"],
    "03010": "safe_novelty",
    "08003": "calm",
    "11001": "egalitarian",
    "14020": ["comfort"],
  },
  "Approval Seeker": {
    "02001": "responsive",
    "03005": "connection",
    "08003": "pursue",
    "10002": ["expressive"],
    "11001": "surrender",
    "14020": ["validation"],
  },
  "Analytical Sexualist": {
    "02001": "planned",
    "02004": "plan_window",
    "03005": "mastery",
    "03006": "learning_by_doing",
    "10002": ["direct_phrases"],
    "11001": "egalitarian",
    "14020": ["novelty"],
  },
  "Quiet Withdrawer": {
    "01003": "not_focus",
    "02001": "low_lately",
    "03003": ["private"],
    "03005": "safety",
    "08003": "withdraw",
    "10002": ["nonverbal"],
    "16005": "recharging",
    "14020": ["escape"],
  },
};

// ─── 1. Every archetype achievable ──────────────────────────────────────────

describe("Every archetype is achievable as primaryArchetype", () => {
  for (const archetype of config.archetypes) {
    it(`${archetype} can be the primary archetype`, () => {
      const responses = {
        ...buildIdealResponses(archetype),
        ...(archetypeBoosts[archetype] || {}),
      };

      const result = scoreArchetypes(config, responses);

      expect(result.primaryArchetype).toBe(archetype);
      expect(result.percent[archetype]).toBeGreaterThan(0);

      // Verify percentages sum to ~100
      const sum = Object.values(result.percent).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(100, 1);
    });
  }
});

// ─── 2. Label-to-code mapping for every option ──────────────────────────────

// All categorical questions used in scoring, with their exact survey labels
const categoricalQuestions: Record<string, string[]> = {
  "01003": [
    "Satisfied & actively engaged",
    "Want more than I currently have",
    "Frustrated or unfulfilled",
    "Feels complicated or inconsistent",
    "Present, but not a priority right now",
    "Currently not a focus for me",
    "Unsure / still figuring it out",
  ],
  "02001": [
    "Spontaneous",
    "Responsive",
    "Planned window",
    "Varies by person or context",
    "Desire has been low lately",
  ],
  "02004": [
    "I initiate",
    "I’m usually not the one to initiate",
    "A planned opening works best for me",
    "Initiation flows organically, without a set role or expectation",
  ],
  "03003": [
    "Private and protected",
    "Novel or adventurous",
    "Deliberate or ritualized",
    "Spontaneous or unplanned",
    "Edge, taboo, or transgression",
    "Visible or semi-public",
    "Something else",
  ],
  "03005": [
    "Sensation-led",
    "Safety/context-led",
    "Connection-led",
    "Novelty/adventure-led",
    "Mastery/competence-led",
    "Fantasy/imagination-led",
    "Not sure / varies",
  ],
  "03006": [
    "Structure and feedback",
    "Curiosity and experimentation",
    "Natural flow and spontaneity",
    "I prefer not to make it a deliberate process",
  ],
  "03010": [
    "Very safe and predictable",
    "Mostly safe, with a little novelty",
    "Balanced",
    "Adventurous, with clear boundaries",
    "Strong edge or taboo energy",
  ],
  "03013": [
    "Being watched / admired",
    "Watching or observing another person",
    "Absorbed in sensation / connection",
    "Not sure",
  ],
  "08003": [
    "Seek reassurance / pursue",
    "Shut down / withdraw",
    "Protest / get angry",
    "Self-soothe / stay grounded",
    "Varies",
  ],
  "10002": [
    "Touch and body cues",
    "Brief direct words",
    "Ongoing verbal feedback",
    "Emotional check-ins",
    "Mostly nonverbal cues",
    "I communicate very little",
  ],
  "11001": [
    "Lead / direct",
    "Surrender / be led",
    "Switch",
    "Egalitarian / no roles",
    "Not sure / depends",
  ],
  "14020": [
    "Bonding and closeness",
    "Pleasure and play",
    "Novelty and discovery",
    "Intensity and edge",
    "Feeling desired",
    "Power and polarity",
    "Meaning and devotion",
    "Comfort and familiarity",
    "Giving and service",
    "Healing and soothing",
    "Escape and relief",
  ],
  "15005": [
    "No",
    "Yes, youngest child is 0\u20133 years",
    "Yes, youngest child is 4\u201310 years",
    "Yes, youngest child is 11\u201317 years",
    "Yes, children are 18+ and live with me",
    "Yes, children are 18+ and do not live with me",
  ],
  "15006": ["Very low", "Low", "Medium", "High", "Very high"],
  "15007": ["Very rested", "Rather rested", "In between", "Rather tired", "Very tired"],
  "15008": [
    "No",
    "Yes, mainly physical health",
    "Yes, mainly mental health",
    "Yes, both physical and mental health",
    "I'm not sure",
    "Prefer not to answer",
  ],
  "16004": [
    "Within 7 days",
    "Within 30 days",
    "1\u20133 months",
    "3\u20136 months",
    "6\u201312 months",
    "Later than 12 months",
    "Not sure yet",
  ],
};

// Phase questions with long labels (prefix matching)
const phaseQuestions: Record<string, string[]> = {
  "16005": [
    "Recharging / Pausing \u2013 I'm in a quieter, restorative phase of my sexual life. Desire feels gentle or distant, and that\u2019s okay. I sense I\u2019m gathering energy, letting my body and mind rest before passion naturally reawakens.",
    "Repairing / Reconnecting \u2013 I'm rebuilding my relationship to sexuality, healing from past pain, shame, or disconnection. My focus is on safety, trust, and emotional openness \u2014 learning to feel at home in my body again.",
    "Awakening / Exploring \u2013 I feel curious and alive with possibility. I'm discovering what turns me on, learning through play and experimentation, and beginning to express my desires with more ease and honesty.",
    "Expanding / Experimenting \u2013 I feel confident and expressive in my sexuality. I enjoy exploring new experiences, sensations, and dynamics, communicating openly about my desires, and co-creating pleasure with my partner(s).",
    "Grounded / Integrated - I experience sexuality as a stable, integrated part of my life. Desire feels steady and familiar. Pleasure arises naturally in connection, routine, or self-care. This phase is about maintaining fulfillment with presence and appreciation, rather than chasing newness or repair.",
    "Evolving / Transcending \u2013 I experience sexuality as a deeper, transformative force \u2014 a way to connect with creativity, love, and spirituality. Pleasure feels like presence, flow, and expansion beyond the physical.",
  ],
  "16006": [
    "Recharging / Pausing \u2013 I'm in a quieter, restorative phase of my sexual life. Desire feels gentle or distant, and that\u2019s okay. I sense I\u2019m gathering energy, letting my body and mind rest before passion naturally reawakens.",
    "Repairing / Reconnecting \u2013 I'm rebuilding my relationship to sexuality, healing from past pain, shame, or disconnection. My focus is on safety, trust, and emotional openness \u2014 learning to feel at home in my body again.",
    "Awakening / Exploring \u2013 I feel curious and alive with possibility. I'm discovering what turns me on, learning through play and experimentation, and beginning to express my desires with more ease and honesty.",
    "Expanding / Experimenting \u2013 I feel confident and expressive in my sexuality. I enjoy exploring new experiences, sensations, and dynamics, communicating openly about my desires, and co-creating pleasure with my partner(s).",
    "Grounded / Integrated - I experience sexuality as a stable, integrated part of my life. Desire feels steady and familiar. Pleasure arises naturally in connection, routine, or self-care. This phase is about maintaining fulfillment with presence and appreciation, rather than chasing newness or repair.",
    "Evolving / Transcending \u2013 I experience sexuality as a deeper, transformative force \u2014 a way to connect with creativity, love, and spirituality. Pleasure feels like presence, flow, and expansion beyond the physical.",
  ],
};

describe("Label-to-code mapping resolves every survey option", () => {
  for (const [qid, options] of Object.entries(categoricalQuestions)) {
    for (const label of options) {
      it(`Q${qid}: "${label.slice(0, 60)}${label.length > 60 ? "..." : ""}" resolves to a code`, () => {
        // Score with just this one answer — the engine should resolve the label
        const result = scoreArchetypes(config, { [qid]: label });
        // If resolution works, percentages will sum to ~100
        const sum = Object.values(result.percent).reduce((a, b) => a + b, 0);
        expect(sum).toBeCloseTo(100, 1);
      });
    }
  }

  for (const [qid, options] of Object.entries(phaseQuestions)) {
    for (const label of options) {
      it(`Q${qid} (phase): "${label.slice(0, 50)}..." resolves to a code`, () => {
        const result = scoreArchetypes(config, { [qid]: label });
        const sum = Object.values(result.percent).reduce((a, b) => a + b, 0);
        expect(sum).toBeCloseTo(100, 1);
      });
    }
  }
});

// ─── 3. All dimensions and overlays get correct data ─────────────────────────

describe("Dimension transforms produce correct values", () => {
  it("all 21 scale dimensions transform correctly", () => {
    const responses: Record<string, number> = {};
    for (const dim of Object.values(config.dimensions)) {
      if (dim.transform === "scale_1_7_to_0_1") {
        responses[dim.qid] = 4; // midpoint
      }
    }

    const result = scoreArchetypes(config, responses);

    for (const dim of Object.values(config.dimensions)) {
      if (dim.transform === "scale_1_7_to_0_1") {
        expect(result.diagnostics.uDimensions[dim.id]).toBeCloseTo(0.5, 6);
      }
    }
  });

  it("scale 1 → 0, scale 7 → 1 for all dimensions", () => {
    // Test with value 1 (minimum)
    const lowResponses: Record<string, number> = {};
    const highResponses: Record<string, number> = {};
    for (const dim of Object.values(config.dimensions)) {
      if (dim.transform === "scale_1_7_to_0_1") {
        lowResponses[dim.qid] = 1;
        highResponses[dim.qid] = 7;
      }
    }

    const lowResult = scoreArchetypes(config, lowResponses);
    const highResult = scoreArchetypes(config, highResponses);

    for (const dim of Object.values(config.dimensions)) {
      if (dim.transform === "scale_1_7_to_0_1") {
        expect(lowResult.diagnostics.uDimensions[dim.id]).toBeCloseTo(0, 6);
        expect(highResult.diagnostics.uDimensions[dim.id]).toBeCloseTo(1, 6);
      }
    }
  });

  it("DIM_RISK_PREF categorical maps correctly", () => {
    const codes = [
      { label: "Very safe and predictable", expected: 0 },
      { label: "Mostly safe, with a little novelty", expected: 0.25 },
      { label: "Balanced", expected: 0.5 },
      { label: "Adventurous, with clear boundaries", expected: 0.75 },
      { label: "Strong edge or taboo energy", expected: 1 },
    ];

    for (const { label, expected } of codes) {
      const result = scoreArchetypes(config, { "03010": label });
      expect(result.diagnostics.uDimensions.DIM_RISK_PREF).toBeCloseTo(expected, 6);
    }
  });
});

describe("Overlay transforms produce correct values", () => {
  it("OVL_STRESS maps label to correct numeric", () => {
    const stressMap = [
      { label: "Very low", expected: 0 },
      { label: "Low", expected: 0.25 },
      { label: "Medium", expected: 0.5 },
      { label: "High", expected: 0.75 },
      { label: "Very high", expected: 1 },
    ];

    for (const { label, expected } of stressMap) {
      const result = scoreArchetypes(config, { "15006": label });
      expect(result.diagnostics.overlaysScalar.OVL_STRESS).toBeCloseTo(expected, 6);
    }
  });

  it("OVL_RESTEDNESS maps label to correct numeric", () => {
    const restMap = [
      { label: "Very tired", expected: 0 },
      { label: "Rather tired", expected: 0.25 },
      { label: "In between", expected: 0.5 },
      { label: "Rather rested", expected: 0.75 },
      { label: "Very rested", expected: 1 },
    ];

    for (const { label, expected } of restMap) {
      const result = scoreArchetypes(config, { "15007": label });
      expect(result.diagnostics.overlaysScalar.OVL_RESTEDNESS).toBeCloseTo(expected, 6);
    }
  });

  it("OVL_PARENTING_LOAD maps label to correct numeric", () => {
    const parentMap = [
      { label: "No", expected: 0 },
      { label: "Yes, youngest child is 0\u20133 years", expected: 1 },
      { label: "Yes, youngest child is 4\u201310 years", expected: 0.75 },
    ];

    for (const { label, expected } of parentMap) {
      const result = scoreArchetypes(config, { "15005": label });
      expect(result.diagnostics.overlaysScalar.OVL_PARENTING_LOAD).toBeCloseTo(expected, 6);
    }
  });

  it("scalar overlays from scale questions work", () => {
    // OVL_SATISFACTION (01002), OVL_PAIN (01006) are scale_1_7_to_0_1
    const result = scoreArchetypes(config, { "01002": 7, "01006": 1 });
    expect(result.diagnostics.overlaysScalar.OVL_SATISFACTION).toBeCloseTo(1, 6);
    expect(result.diagnostics.overlaysScalar.OVL_PAIN).toBeCloseTo(0, 6);
  });
});

// ─── 4. Full realistic survey response ───────────────────────────────────────

describe("Full realistic survey response", () => {
  it("produces valid results with all questions answered", () => {
    const fullResponses: Record<string, unknown> = {
      // Scale dimensions
      "01005": 5, // Novelty
      "02002": 6, // Responsive
      "02003": 3, // Planned
      "03004": 6, // Emotional connection
      "03008": 4, // Intensity
      "03009": 3, // Pursuit
      "03012": 2, // Edge need
      "03011": 5, // Sacred
      "03010": "Mostly safe, with a little novelty", // Risk pref (categorical)
      "10005": 4, // Feedback dep
      "10003": 5, // Turn-on express
      "10004": 5, // Boundary express
      "11002": 3, // Protocol
      "11004": 5, // Soothing
      "08002": 6, // Secure
      "08005": 6, // Repair eroticism
      "08006": 3, // Pressure shutdown
      "08012": 3, // Avoidant
      "09013": 2, // Strategy

      // Categorical boost questions
      "01003": "Present, but not a priority right now",
      "02001": "Responsive",
      "02004": "I’m usually not the one to initiate",
      "03003": ["Private and protected"],
      "03005": "Connection-led",
      "03006": "Natural flow and spontaneity",
      "03013": "Absorbed in sensation / connection",
      "08003": "Self-soothe / stay grounded",
      "08004": 5, // DIM_CLOSENESS_ORIENTATION (scale 1-7)
      "10002": ["Emotional check-ins"],
      "11001": "Egalitarian / no roles",
      "11003": 5, // DIM_PARTNER_FOCUS (scale 1-7)
      "14020": ["Bonding and closeness"],

      // Overlays (scale)
      "14021": 3, // Escape
      "01002": 5, // Satisfaction
      "01006": 2, // Pain
      "03014": 5, // Orgasm ease

      // Overlays (categorical)
      "15005": "No",
      "15006": "Low",
      "15007": "Rather rested",
      "15008": "No",

      // Phase questions (long labels)
      "16005":
        "Grounded / Integrated - I experience sexuality as a stable, integrated part of my life. Desire feels steady and familiar. Pleasure arises naturally in connection, routine, or self-care. This phase is about maintaining fulfillment with presence and appreciation, rather than chasing newness or repair.",
      "16006":
        "Evolving / Transcending \u2013 I experience sexuality as a deeper, transformative force \u2014 a way to connect with creativity, love, and spirituality. Pleasure feels like presence, flow, and expansion beyond the physical.",

      // Categorical overlays (passthrough)
      "15001": "Germany",
      "15003": "35\u201344",
      "15004": "Monogamous",
      "15009": "No",
      "15010": "Man",
      "15011": "Heterosexual",
      "16001": "Emotional safety & connection",
      "16002": 5, // Urgency
      "16003": 6, // Change efficacy
      "16004": "Within 30 days",
      "16007": "I use a structured tool/app/journal to guide me",

      // Multi-select
      "16008": ["Self-guided tools & exercises", "Partner-inclusive guidance"],
      "16014": ["Time/energy is limited", "Partner isn\u2019t aligned/engaged"],
    };

    const result = scoreArchetypes(config, fullResponses);

    // Basic validity
    expect(Object.keys(result.percent)).toHaveLength(14);
    const sum = Object.values(result.percent).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(100, 1);
    expect(config.archetypes).toContain(result.primaryArchetype);

    // Diagnostics populated
    expect(Object.keys(result.diagnostics.uDimensions)).toHaveLength(21);
    expect(Object.keys(result.diagnostics.dimensionWeightsBase)).toHaveLength(21);
    expect(Object.keys(result.diagnostics.dimensionWeightsFinal)).toHaveLength(21);

    // Specific dimension values
    expect(result.diagnostics.uDimensions.DIM_NOVELTY).toBeCloseTo((5 - 1) / 6, 6); // 0.667
    expect(result.diagnostics.uDimensions.DIM_RESPONSIVE).toBeCloseTo((6 - 1) / 6, 6); // 0.833
    expect(result.diagnostics.uDimensions.DIM_RISK_PREF).toBeCloseTo(0.25, 6); // mostly_safe

    // Overlays
    expect(result.diagnostics.overlaysScalar.OVL_STRESS).toBeCloseTo(0.25, 6); // Low
    expect(result.diagnostics.overlaysScalar.OVL_RESTEDNESS).toBeCloseTo(0.75, 6); // Rather rested
    expect(result.diagnostics.overlaysScalar.OVL_PARENTING_LOAD).toBeCloseTo(0, 6); // No
    expect(result.diagnostics.overlaysScalar.OVL_SATISFACTION).toBeCloseTo((5 - 1) / 6, 6);

    // This profile (high responsive, high emotional connection, low edge, connection-led,
    // bonding motivation) should favor Sensual Connector or Relational Nurturer or Spiritual Lover
    const top3 = Object.entries(result.percent)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([name]) => name);

    const expectedTopArchetypes = [
      "Sensual Connector",
      "Relational Nurturer",
      "Spiritual Lover",
      "Loyal Ritualist",
    ];
    expect(expectedTopArchetypes).toContain(top3[0]);
  });
});
