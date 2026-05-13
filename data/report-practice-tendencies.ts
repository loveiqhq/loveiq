// Auto-generated from practice tendency .docx files — do not edit manually.
// Run: node scripts/generate-practice-tendencies.js

export interface ReportPracticeTendencyRow {
  practice: string;
  fantasyPull: number;
  actualPleasure: number;
  description: string | null;
}

export interface ReportPracticeTendencyGroup {
  title: string;
  rows: ReportPracticeTendencyRow[];
}

export interface ReportPracticeTendencyContent {
  introBlocks: string[];
  groups: ReportPracticeTendencyGroup[];
}

export const reportPracticeTendencies: Record<string, ReportPracticeTendencyContent> = {
  "Sensual Connector": {
    introBlocks: [
      "<p>These scores <strong>do not define you as an individual</strong>. They are <strong>probability-based estimates derived from aggregated research and observed patterns across archetypes.</strong></p>",
      "<p>They <strong>reflect what is statistically more common, not what is fixed or deterministic for you individually.</strong> Every person is unique, and real-world preferences are shaped by personal experience, context, development, and the combination of multiple archetypes within you.</p>",
      "<p>This means your actual desires, boundaries, and experiences may align with, differ from, or evolve beyond these patterns — sometimes significantly.</p>",
      "<p>We present two separate metrics on a 10-point scale:</p>",
      "<ul><li><strong>Fantasy Pull:</strong> how strongly a theme tends to appear in imagination, curiosity, or arousal</li><li><strong>Lived Pleasure:</strong> how likely the same theme is to feel grounding, pleasurable, and genuinely good when experienced in real life</li></ul>",
      "<p><strong>Fantasy Pull:</strong></p>",
      "<ul><li><strong>High</strong> (7–10): More likely to feel mentally engaging, arousing, or intriguing in imagination.</li><li><strong>Low</strong> (1–4): Less likely to capture attention or appear in imagination arousing.</li></ul>",
      "<p><strong>Actual Pleasure:</strong></p>",
      "<ul><li><strong>High</strong> (7–10): More likely to feel physically and/or emotionally satisfying in real-life experience (given the right context, such as trust and safety).</li><li><strong>Low</strong> (1–4): Less likely to feel rewarding, pleasurable or to resonate strongly in practice</li></ul>",
      "<p><strong>How to read combinations of scores</strong></p>",
      "<p>Because Fantasy Pull and Lived Pleasure are independent, the relationship between them matters. Looking at both together helps you understand how a theme tends to show up in your mind vs. in real experience.</p>",
      "<p><strong>Low Fantasy + Low Pleasure</strong> → Generally not relevant<br />This suggests a theme is neither mentally engaging nor particularly rewarding in practice. Typically something to deprioritize, unless curiosity emerges naturally over time.</p>",
      "<p><strong>Low Fantasy + High Pleasure</strong> → Better in reality than in imagination</p>",
      "<p>You may not think about it much, but when experienced, it can feel surprisingly good or fulfilling. Often worth gently exploring in real-life contexts, as these areas can reveal unexpected compatibility.</p>",
      "<p><strong>High Fantasy + Low Pleasure</strong> → Stronger in imagination than in reality<br />There is a strong mental or symbolic attraction, but less consistent satisfaction in practice. Calls for conscious exploration and adjustment — refining context, pace, or boundaries — or keeping parts of it in fantasy where it feels most aligned.</p>",
      "<p><strong>High Fantasy + High Pleasure</strong> → Alignment between mind and experience<br />What feels exciting in imagination is also likely to feel good in reality. These are areas to lean into and deepen, often representing natural sources of fulfillment and ease.</p>",
    ],
    groups: [
      {
        title: "Core Relational & Embodied",
        rows: [
          {
            practice: "Romantic lovemaking",
            fantasyPull: 7,
            actualPleasure: 9,
            description:
              "Sex centered on affection, tenderness, and feeling emotionally chosen. Organizes attachment, safety, and bonding.",
          },
          {
            practice: "Slow build / extended foreplay",
            fantasyPull: 7,
            actualPleasure: 10,
            description:
              "Gradual arousal through time, touch, and anticipation. Organizes nervous-system regulation and trust.",
          },
          {
            practice: "Passionate quickies",
            fantasyPull: 3,
            actualPleasure: 3,
            description:
              "Fast, urgent sex driven by impulse. Organizes excitement, release, and novelty.",
          },
          {
            practice: "Morning sex",
            fantasyPull: 5,
            actualPleasure: 6,
            description:
              "Gentle or energized intimacy after waking. Organizes comfort, connection, and bodily openness.",
          },
          {
            practice: "Sleeping / wake-up sex",
            fantasyPull: 6,
            actualPleasure: 7,
            description:
              "Intimacy while drifting in or out of sleep. Organizes vulnerability and softness.",
          },
          {
            practice: "After-argument / makeup sex",
            fantasyPull: 5,
            actualPleasure: 5,
            description: "Sex after conflict. Organizes emotional repair and tension discharge.",
          },
          {
            practice: "Romantic aftercare",
            fantasyPull: 7,
            actualPleasure: 8,
            description:
              "Cuddling, closeness, and reassurance after sex. Organizes emotional completion and safety.",
          },
          {
            practice: "Emotional vulnerability during sex",
            fantasyPull: 8,
            actualPleasure: 9,
            description:
              "Sharing feelings or being emotionally open while intimate. Organizes being seen and accepted.",
          },
          {
            practice: "Crying or emotional release",
            fantasyPull: 6,
            actualPleasure: 9,
            description:
              "Letting emotions surface during intimacy. Organizes catharsis and relief.",
          },
          {
            practice: "Emotional healing sex",
            fantasyPull: 6,
            actualPleasure: 8,
            description:
              "Using intimacy to soothe or repair emotionally. Organizes nervous-system regulation.",
          },
          {
            practice: "Spiritual merging / oneness",
            fantasyPull: 8,
            actualPleasure: 10,
            description:
              "Experiencing sex as a transcendent union. Organizes meaning and connection beyond self.",
          },
        ],
      },
      {
        title: "Touch, Sensory & Body-Based",
        rows: [
          {
            practice: "Sensual massage",
            fantasyPull: 7,
            actualPleasure: 9,
            description:
              "Slow, attentive touch meant to relax and awaken sensation. Organizes safety and body awareness.",
          },
          {
            practice: "Erotic massage exchange",
            fantasyPull: 7,
            actualPleasure: 10,
            description:
              "Partners take turns giving sensual touch. Organizes mutual giving and receiving.",
          },
          {
            practice: "Sensory play",
            fantasyPull: 6,
            actualPleasure: 6,
            description:
              "Using textures, sounds, or sensations to heighten awareness. Organizes curiosity and bodily focus.",
          },
          {
            practice: "Sensory deprivation / blindfolds",
            fantasyPull: 3,
            actualPleasure: 2,
            description:
              "Limiting senses to intensify others. Organizes surrender and concentration.",
          },
          {
            practice: "Temperature play",
            fantasyPull: 3,
            actualPleasure: 3,
            description:
              "Using warmth or coolness to stimulate nerves. Organizes novelty and alertness.",
          },
          {
            practice: "Slow synchronized breathing",
            fantasyPull: 7,
            actualPleasure: 8,
            description: "Breathing together. Organizes co-regulation and calm.",
          },
          {
            practice: "Mutual tantric gaze",
            fantasyPull: 8,
            actualPleasure: 9,
            description: "Holding eye contact for extended time. Organizes emotional presence.",
          },
          {
            practice: "Scent / pheromone play",
            fantasyPull: 6,
            actualPleasure: 7,
            description: "Using smell as an arousal cue. Organizes primal attraction.",
          },
          {
            practice: "Multi-sensory immersion",
            fantasyPull: 8,
            actualPleasure: 10,
            description:
              "Combining sound, touch, smell, and atmosphere. Organizes full-body engagement.",
          },
        ],
      },
      {
        title: "Giving vs Receiving Stimulation",
        rows: [
          {
            practice: "Giving oral",
            fantasyPull: 5,
            actualPleasure: 6,
            description: "Pleasing a partner with a mouth. Organizes caretaking and attentiveness.",
          },
          {
            practice: "Receiving oral",
            fantasyPull: 5,
            actualPleasure: 5,
            description:
              "Being pleasured by a partner’s mouth. Organizes feeling wanted and focused on.",
          },
          {
            practice: "Giving manual stimulation",
            fantasyPull: 5,
            actualPleasure: 7,
            description: "Pleasing a partner with hands. Organizes giving and responsiveness.",
          },
          {
            practice: "Receiving manual stimulation",
            fantasyPull: 5,
            actualPleasure: 4,
            description: "Being pleasured by touch. Organizes being held in erotic attention.",
          },
          {
            practice: "Mutual masturbation",
            fantasyPull: 3,
            actualPleasure: 2,
            description:
              "Both partners pleasure themselves together. Organizes shared presence with autonomy.",
          },
          {
            practice: "Masturbating in front of partner",
            fantasyPull: 3,
            actualPleasure: 1,
            description:
              "Self-pleasure while being watched. Organizes being desired without effort.",
          },
          {
            practice: "Using toys on partner",
            fantasyPull: 3,
            actualPleasure: 3,
            description: "Enhancing their sensation. Organizes caretaking and curiosity.",
          },
          {
            practice: "Having toys used on you",
            fantasyPull: 4,
            actualPleasure: 2,
            description: "Receiving intensified stimulation. Organizes surrender and focus.",
          },
        ],
      },
      {
        title: "Penetration & Body Opening",
        rows: [
          {
            practice: "Penetrating partner",
            fantasyPull: 2,
            actualPleasure: 2,
            description: "Being the active, initiating body. Organizes agency and movement.",
          },
          {
            practice: "Being penetrated",
            fantasyPull: 2,
            actualPleasure: 3,
            description:
              "Allowing the partner inside one’s body. Organizes surrender and openness.",
          },
          {
            practice: "Pegging",
            fantasyPull: 3,
            actualPleasure: 1,
            description:
              "Being penetrated by a partner using a device. Organizes role-reversal and trust.",
          },
          {
            practice: "Anal play (giving)",
            fantasyPull: 3,
            actualPleasure: 2,
            description: "Stimulating a partner anally. Organizes control and taboo.",
          },
          {
            practice: "Anal play (receiving)",
            fantasyPull: 2,
            actualPleasure: 1,
            description: "Being anally stimulated. Organizes vulnerability and surrender.",
          },
          {
            practice: "Double-penetration fantasy",
            fantasyPull: 4,
            actualPleasure: 1,
            description:
              "Imagining intense bodily overwhelm. Organizes extremity and fantasy of being overtaken.",
          },
        ],
      },
      {
        title: "Power & Role Dynamics",
        rows: [
          {
            practice: "Dominating",
            fantasyPull: 3,
            actualPleasure: 2,
            description: "Taking charge and directing the encounter. Organizes agency and control.",
          },
          {
            practice: "Submitting",
            fantasyPull: 6,
            actualPleasure: 5,
            description: "Letting the partner lead. Organizes trust and release of responsibility.",
          },
          {
            practice: "Romantic dominance",
            fantasyPull: 6,
            actualPleasure: 6,
            description: "Leading in a caring, protective way. Organizes safety and attraction.",
          },
          {
            practice: "Service submission",
            fantasyPull: 6,
            actualPleasure: 4,
            description:
              "Showing devotion by pleasing the partner. Organizes caretaking and meaning.",
          },
          {
            practice: "Worshipping partner",
            fantasyPull: 6,
            actualPleasure: 7,
            description:
              "Treating the partner as precious or ideal. Organizes devotion and admiration.",
          },
          {
            practice: "Being worshipped",
            fantasyPull: 7,
            actualPleasure: 6,
            description: "Being idealized and adored. Organizes validation and self-worth.",
          },
          {
            practice: "Master–slave (consensual)",
            fantasyPull: 4,
            actualPleasure: 1,
            description: "Formalized hierarchy. Organizes identity and power structure.",
          },
          {
            practice: "Power exchange (24/7 or partial)",
            fantasyPull: 4,
            actualPleasure: 2,
            description: "Maintaining roles inside and outside sex. Organizes lifestyle identity.",
          },
        ],
      },
      {
        title: "Pain, Restraint & Edge",
        rows: [
          {
            practice: "Giving impact (spanking, etc.)",
            fantasyPull: 3,
            actualPleasure: 1,
            description: "Applying controlled physical sensation. Organizes expression of power.",
          },
          {
            practice: "Receiving impact",
            fantasyPull: 2,
            actualPleasure: 1,
            description: "Experiencing strong sensation. Organizes surrender and intensity.",
          },
          {
            practice: "Biting / scratching",
            fantasyPull: 3,
            actualPleasure: 2,
            description: "Primal physical expression. Organizes animalistic energy.",
          },
          {
            practice: "Choking / neck holding (light, consensual)",
            fantasyPull: 4,
            actualPleasure: 1,
            description:
              "Heightened intensity through trust and risk. Organizes surrender and thrill.",
          },
          {
            practice: "Restraining partner",
            fantasyPull: 2,
            actualPleasure: 2,
            description: "Limiting movement. Organizes control and dominance.",
          },
          {
            practice: "Being restrained",
            fantasyPull: 4,
            actualPleasure: 2,
            description: "Having movement limited. Organizes surrender and focus.",
          },
          {
            practice: "Erotic pain endurance",
            fantasyPull: 5,
            actualPleasure: 1,
            description: "Holding a strong sensation. Organizes challenge and resilience.",
          },
          {
            practice: "Shibari / erotic rope art",
            fantasyPull: 3,
            actualPleasure: 3,
            description: "Aesthetic and emotional restraint. Organizes beauty and surrender.",
          },
        ],
      },
      {
        title: "Erotic Attention, Voyeurism & Third-Party Themes",
        rows: [
          {
            practice: "Being watched by partner",
            fantasyPull: 6,
            actualPleasure: 5,
            description: "Being held in a partner’s desire. Organizes validation and being chosen.",
          },
          {
            practice: "Watching your partner",
            fantasyPull: 6,
            actualPleasure: 6,
            description: "Witnessing their arousal. Organizes empathy and connection.",
          },
          {
            practice: "Voyeurism (watching others)",
            fantasyPull: 3,
            actualPleasure: 2,
            description: "Observing from emotional distance. Organizes curiosity and fantasy.",
          },
          {
            practice: "Exhibitionism",
            fantasyPull: 4,
            actualPleasure: 1,
            description: "Being visible to others. Organizes validation and performance.",
          },
          {
            practice: "Public or semi-public play",
            fantasyPull: 4,
            actualPleasure: 2,
            description: "Risk of being discovered. Organizes thrill and taboo.",
          },
          {
            practice: "Public teasing",
            fantasyPull: 3,
            actualPleasure: 1,
            description: "Secret intimacy in public. Organizes anticipation and bonding.",
          },
          {
            practice: "Being watched secretly by partner",
            fantasyPull: 2,
            actualPleasure: 1,
            description: "Being desired without performing. Organizes effortless validation.",
          },
          {
            practice: "Forced voyeurism fantasy",
            fantasyPull: 5,
            actualPleasure: 1,
            description: "Losing control over who sees you. Organizes exposure and powerlessness.",
          },
          {
            practice: "Cuckold (partner with others)",
            fantasyPull: 5,
            actualPleasure: 2,
            description:
              "Eroticized jealousy and loss of status. Organizes insecurity and surrender.",
          },
          {
            practice: "Hotwifing",
            fantasyPull: 4,
            actualPleasure: 3,
            description:
              "Sharing partner to feel pride and reflected desirability. Organizes status and validation.",
          },
          {
            practice: "Group sex / threesomes",
            fantasyPull: 6,
            actualPleasure: 1,
            description: "Multiple streams of desire. Organizes novelty and attention.",
          },
          {
            practice: "Anonymous encounter fantasy",
            fantasyPull: 2,
            actualPleasure: 3,
            description: "Being desired without being known. Organizes freedom from identity.",
          },
        ],
      },
      {
        title: "Fetish, Identity & Body-Focus",
        rows: [
          {
            practice: "Foot fetish",
            fantasyPull: 3,
            actualPleasure: 2,
            description: "Focus on a specific body part. Organizes symbolic attraction.",
          },
          {
            practice: "Hair fetish",
            fantasyPull: 3,
            actualPleasure: 3,
            description: "Arousal from hair. Organizes sensory fixation.",
          },
          {
            practice: "Breasts / nipple play",
            fantasyPull: 5,
            actualPleasure: 5,
            description: "Chest-focused stimulation. Organizes nurturance and pleasure.",
          },
          {
            practice: "Hands / legs / thighs",
            fantasyPull: 5,
            actualPleasure: 6,
            description: "Body-part focus. Organizes visual and tactile attraction.",
          },
          {
            practice: "Voice fetish",
            fantasyPull: 6,
            actualPleasure: 7,
            description: "Arousal from sound. Organizes emotional resonance.",
          },
          {
            practice: "Cross-dressing / gender play",
            fantasyPull: 3,
            actualPleasure: 1,
            description:
              "Wearing or exploring different gendered roles. Organizes identity exploration.",
          },
          {
            practice: "Lingerie / fetish wear",
            fantasyPull: 6,
            actualPleasure: 6,
            description: "Erotic clothing. Organizes display and identity.",
          },
          {
            practice: "Worshipping partner’s body",
            fantasyPull: 6,
            actualPleasure: 8,
            description: "Admiring the partner’s physical form. Organizes devotion.",
          },
        ],
      },
      {
        title: "Taboo, Fluids & Extreme Kink",
        rows: [
          {
            practice: "Cum play",
            fantasyPull: 3,
            actualPleasure: 1,
            description: "Focus on sexual fluids. Organizes taboo and intimacy.",
          },
          {
            practice: "Pee / golden shower",
            fantasyPull: 4,
            actualPleasure: 1,
            description: "Using urine as a taboo element. Organizes transgression.",
          },
          {
            practice: "Scat",
            fantasyPull: 4,
            actualPleasure: 2,
            description: "Using feces as erotic element. Organizes extreme taboo.",
          },
          {
            practice: "Breeding fantasy",
            fantasyPull: 3,
            actualPleasure: 2,
            description: "Imagining impregnation. Organizes fertility and legacy.",
          },
          {
            practice: "Pregnancy play",
            fantasyPull: 2,
            actualPleasure: 1,
            description: "Eroticizing pregnancy. Organizes nurture and taboo.",
          },
          {
            practice: "Lactation play",
            fantasyPull: 2,
            actualPleasure: 2,
            description: "Milk as erotic symbol. Organizes nurturance.",
          },
          {
            practice: "Object insertion",
            fantasyPull: 3,
            actualPleasure: 3,
            description: "Using non-sexual objects. Organizes novelty and taboo.",
          },
          {
            practice: "Food play",
            fantasyPull: 2,
            actualPleasure: 3,
            description: "Using food in erotic context. Organizes sensory transgression.",
          },
        ],
      },
      {
        title: "Technology & Distance",
        rows: [
          {
            practice: "Sexting",
            fantasyPull: 3,
            actualPleasure: 2,
            description: "Sending erotic messages. Organizes anticipation and desire.",
          },
          {
            practice: "Erotic voice / audio",
            fantasyPull: 5,
            actualPleasure: 5,
            description: "Hearing arousing speech. Organizes intimacy through sound.",
          },
          {
            practice: "Erotic photography / filming",
            fantasyPull: 3,
            actualPleasure: 1,
            description: "Recording intimacy. Organizes being seen and remembered.",
          },
          {
            practice: "Mutual video masturbation",
            fantasyPull: 4,
            actualPleasure: 1,
            description: "Remote shared arousal. Organizes connection across distance.",
          },
          {
            practice: "Long-distance sexual play",
            fantasyPull: 5,
            actualPleasure: 6,
            description: "Maintaining intimacy when apart. Organizes emotional continuity.",
          },
        ],
      },
      {
        title: "Ritual, Tantra & Conscious Sex",
        rows: [
          {
            practice: "Tantra / spiritual sexuality",
            fantasyPull: 8,
            actualPleasure: 10,
            description: "Presence-based intimacy. Organizes awareness and depth.",
          },
          {
            practice: "Sacred kink",
            fantasyPull: 8,
            actualPleasure: 9,
            description: "Ritualized erotic power. Organizes meaning and transformation.",
          },
          {
            practice: "Sensual rituals",
            fantasyPull: 7,
            actualPleasure: 9,
            description: "Structured, intentional intimacy. Organizes focus and connection.",
          },
          {
            practice: "Mirror sex",
            fantasyPull: 3,
            actualPleasure: 1,
            description: "Watching oneself and partner. Organizes self-awareness.",
          },
          {
            practice: "Mutual surrender experience",
            fantasyPull: 9,
            actualPleasure: 10,
            description: "Letting go together. Organizes trust and union.",
          },
          {
            practice: "Shadow work through sex",
            fantasyPull: 8,
            actualPleasure: 8,
            description: "Exploring shame or hidden parts. Organizes integration.",
          },
        ],
      },
    ],
  },
  "Spark Seeker": {
    introBlocks: [
      "<p>These scores <strong>do not define you as an individual</strong>. They are <strong>probability-based estimates derived from aggregated research and observed patterns across archetypes.</strong></p>",
      "<p>They <strong>reflect what is statistically more common, not what is fixed or deterministic for you individually.</strong> Every person is unique, and real-world preferences are shaped by personal experience, context, development, and the combination of multiple archetypes within you.</p>",
      "<p>This means your actual desires, boundaries, and experiences may align with, differ from, or evolve beyond these patterns — sometimes significantly.</p>",
      "<p>We present two separate metrics on a 10-point scale:</p>",
      "<ul><li><strong>Fantasy Pull:</strong> how strongly a theme tends to appear in imagination, curiosity, or arousal</li><li><strong>Lived Pleasure:</strong> how likely the same theme is to feel grounding, pleasurable, and genuinely good when experienced in real life</li></ul>",
      "<p><strong>Fantasy Pull:</strong></p>",
      "<ul><li><strong>High</strong> (7–10): More likely to feel mentally engaging, arousing, or intriguing in imagination.</li><li><strong>Low</strong> (1–4): Less likely to capture attention or appear in imagination arousing.</li></ul>",
      "<p><strong>Actual Pleasure:</strong></p>",
      "<ul><li><strong>High</strong> (7–10): More likely to feel physically and/or emotionally satisfying in real-life experience (given the right context, such as trust and safety).</li><li><strong>Low</strong> (1–4): Less likely to feel rewarding, pleasurable or to resonate strongly in practice</li></ul>",
      "<p><strong>How to read combinations of scores</strong></p>",
      "<p>Because Fantasy Pull and Lived Pleasure are independent, the relationship between them matters. Looking at both together helps you understand how a theme tends to show up in your mind vs. in real experience.</p>",
      "<p><strong>Low Fantasy + Low Pleasure</strong> → Generally not relevant<br />This suggests a theme is neither mentally engaging nor particularly rewarding in practice. Typically something to deprioritize, unless curiosity emerges naturally over time.</p>",
      "<p><strong>Low Fantasy + High Pleasure</strong> → Better in reality than in imagination</p>",
      "<p>You may not think about it much, but when experienced, it can feel surprisingly good or fulfilling. Often worth gently exploring in real-life contexts, as these areas can reveal unexpected compatibility.</p>",
      "<p><strong>High Fantasy + Low Pleasure</strong> → Stronger in imagination than in reality<br />There is a strong mental or symbolic attraction, but less consistent satisfaction in practice. Calls for conscious exploration and adjustment — refining context, pace, or boundaries — or keeping parts of it in fantasy where it feels most aligned.</p>",
      "<p><strong>High Fantasy + High Pleasure</strong> → Alignment between mind and experience<br />What feels exciting in imagination is also likely to feel good in reality. These are areas to lean into and deepen, often representing natural sources of fulfillment and ease.</p>",
    ],
    groups: [
      {
        title: "Core Relational & Embodied",
        rows: [
          {
            practice: "Romantic lovemaking",
            fantasyPull: 5,
            actualPleasure: 7,
            description:
              "Sex centered on affection, tenderness, and feeling emotionally chosen. Organizes chemistry, freedom, and playful connection.",
          },
          {
            practice: "Slow build / extended foreplay",
            fantasyPull: 5,
            actualPleasure: 8,
            description:
              "Gradual arousal through time, touch, and anticipation. Organizes activation and momentum and choice and spontaneity.",
          },
          {
            practice: "Passionate quickies",
            fantasyPull: 4,
            actualPleasure: 4,
            description:
              "Fast, urgent sex driven by impulse. Organizes excitement, release, and novelty.",
          },
          {
            practice: "Morning sex",
            fantasyPull: 4,
            actualPleasure: 5,
            description:
              "Gentle or energized intimacy after waking. Organizes ease and excitement, chemistry, and bodily openness.",
          },
          {
            practice: "Sleeping / wake-up sex",
            fantasyPull: 6,
            actualPleasure: 6,
            description:
              "Intimacy while drifting in or out of sleep. Organizes playful openness and playful tenderness.",
          },
          {
            practice: "After-argument / makeup sex",
            fantasyPull: 5,
            actualPleasure: 5,
            description:
              "Sex after conflict. Organizes reconnection and spark and tension discharge.",
          },
          {
            practice: "Romantic aftercare",
            fantasyPull: 6,
            actualPleasure: 7,
            description:
              "Cuddling, closeness, and reassurance after sex. Organizes afterglow and satisfaction and freedom.",
          },
          {
            practice: "Emotional vulnerability during sex",
            fantasyPull: 5,
            actualPleasure: 6,
            description:
              "Sharing feelings or being emotionally open while intimate. Organizes being desired and celebrated.",
          },
          {
            practice: "Crying or emotional release",
            fantasyPull: 4,
            actualPleasure: 6,
            description:
              "Letting emotions surface during intimacy. Organizes catharsis and relief.",
          },
          {
            practice: "Emotional healing sex",
            fantasyPull: 4,
            actualPleasure: 7,
            description:
              "Using intimacy to soothe or repair emotionally. Organizes activation and momentum.",
          },
          {
            practice: "Spiritual merging / oneness",
            fantasyPull: 7,
            actualPleasure: 8,
            description:
              "Experiencing sex as a transcendent union. Organizes aliveness and chemistry beyond self.",
          },
        ],
      },
      {
        title: "Touch, Sensory & Body-Based",
        rows: [
          {
            practice: "Sensual massage",
            fantasyPull: 5,
            actualPleasure: 7,
            description:
              "Slow, attentive touch meant to relax and awaken sensation. Organizes freedom and body awareness.",
          },
          {
            practice: "Erotic massage exchange",
            fantasyPull: 5,
            actualPleasure: 8,
            description:
              "Partners take turns giving sensual touch. Organizes mutual giving and receiving.",
          },
          {
            practice: "Sensory play",
            fantasyPull: 7,
            actualPleasure: 6,
            description:
              "Using textures, sounds, or sensations to heighten awareness. Organizes curiosity and bodily focus.",
          },
          {
            practice: "Sensory deprivation / blindfolds",
            fantasyPull: 7,
            actualPleasure: 7,
            description:
              "Limiting senses to intensify others. Organizes surrender and concentration.",
          },
          {
            practice: "Temperature play",
            fantasyPull: 8,
            actualPleasure: 7,
            description:
              "Using warmth or coolness to stimulate nerves. Organizes novelty and alertness.",
          },
          {
            practice: "Slow synchronized breathing",
            fantasyPull: 5,
            actualPleasure: 6,
            description: "Breathing together. Organizes shared energy and calm.",
          },
          {
            practice: "Mutual tantric gaze",
            fantasyPull: 6,
            actualPleasure: 7,
            description: "Holding eye contact for extended time. Organizes emotional engagement.",
          },
          {
            practice: "Scent / pheromone play",
            fantasyPull: 6,
            actualPleasure: 6,
            description: "Using smell as an arousal cue. Organizes primal attraction.",
          },
          {
            practice: "Multi-sensory immersion",
            fantasyPull: 7,
            actualPleasure: 8,
            description:
              "Combining sound, touch, smell, and atmosphere. Organizes full-body engagement.",
          },
        ],
      },
      {
        title: "Giving vs Receiving Stimulation",
        rows: [
          {
            practice: "Giving oral",
            fantasyPull: 4,
            actualPleasure: 5,
            description: "Pleasing a partner with a mouth. Organizes caretaking and attentiveness.",
          },
          {
            practice: "Receiving oral",
            fantasyPull: 4,
            actualPleasure: 4,
            description:
              "Being pleasured by a partner’s mouth. Organizes feeling wanted and focused on.",
          },
          {
            practice: "Giving manual stimulation",
            fantasyPull: 4,
            actualPleasure: 6,
            description: "Pleasing a partner with hands. Organizes giving and responsiveness.",
          },
          {
            practice: "Receiving manual stimulation",
            fantasyPull: 4,
            actualPleasure: 3,
            description: "Being pleasured by touch. Organizes being held in erotic attention.",
          },
          {
            practice: "Mutual masturbation",
            fantasyPull: 3,
            actualPleasure: 4,
            description:
              "Both partners pleasure themselves together. Organizes shared engagement with autonomy.",
          },
          {
            practice: "Masturbating in front of partner",
            fantasyPull: 5,
            actualPleasure: 4,
            description:
              "Self-pleasure while being watched. Organizes being desired without effort.",
          },
          {
            practice: "Using toys on partner",
            fantasyPull: 3,
            actualPleasure: 3,
            description: "Enhancing their sensation. Organizes caretaking and curiosity.",
          },
          {
            practice: "Having toys used on you",
            fantasyPull: 3,
            actualPleasure: 5,
            description: "Receiving intensified stimulation. Organizes surrender and focus.",
          },
        ],
      },
      {
        title: "Penetration & Body Opening",
        rows: [
          {
            practice: "Penetrating partner",
            fantasyPull: 2,
            actualPleasure: 2,
            description: "Being the active, initiating body. Organizes agency and movement.",
          },
          {
            practice: "Being penetrated",
            fantasyPull: 2,
            actualPleasure: 3,
            description:
              "Allowing the partner inside one’s body. Organizes surrender and openness.",
          },
          {
            practice: "Pegging",
            fantasyPull: 8,
            actualPleasure: 6,
            description:
              "Being penetrated by a partner using a device. Organizes role-reversal and choice and spontaneity.",
          },
          {
            practice: "Anal play (giving)",
            fantasyPull: 8,
            actualPleasure: 7,
            description: "Stimulating a partner anally. Organizes control and taboo.",
          },
          {
            practice: "Anal play (receiving)",
            fantasyPull: 8,
            actualPleasure: 5,
            description: "Being anally stimulated. Organizes playful openness and surrender.",
          },
          {
            practice: "Double-penetration fantasy",
            fantasyPull: 10,
            actualPleasure: 9,
            description:
              "Imagining intense bodily overwhelm. Organizes extremity and fantasy of being overtaken.",
          },
        ],
      },
      {
        title: "Power & Role Dynamics",
        rows: [
          {
            practice: "Dominating",
            fantasyPull: 5,
            actualPleasure: 4,
            description: "Taking charge and directing the encounter. Organizes agency and control.",
          },
          {
            practice: "Submitting",
            fantasyPull: 7,
            actualPleasure: 6,
            description:
              "Letting the partner lead. Organizes choice and spontaneity and release of responsibility.",
          },
          {
            practice: "Romantic dominance",
            fantasyPull: 7,
            actualPleasure: 5,
            description: "Leading in a caring, protective way. Organizes freedom and attraction.",
          },
          {
            practice: "Service submission",
            fantasyPull: 8,
            actualPleasure: 6,
            description:
              "Showing devotion by pleasing the partner. Organizes caretaking and aliveness.",
          },
          {
            practice: "Worshipping partner",
            fantasyPull: 7,
            actualPleasure: 7,
            description:
              "Treating the partner as precious or ideal. Organizes devotion and admiration.",
          },
          {
            practice: "Being worshipped",
            fantasyPull: 6,
            actualPleasure: 6,
            description: "Being idealized and adored. Organizes validation and self-worth.",
          },
          {
            practice: "Master–slave (consensual)",
            fantasyPull: 10,
            actualPleasure: 7,
            description: "Formalized hierarchy. Organizes identity and power structure.",
          },
          {
            practice: "Power exchange (24/7 or partial)",
            fantasyPull: 10,
            actualPleasure: 8,
            description: "Maintaining roles inside and outside sex. Organizes lifestyle identity.",
          },
        ],
      },
      {
        title: "Pain, Restraint & Edge",
        rows: [
          {
            practice: "Giving impact (spanking, etc.)",
            fantasyPull: 8,
            actualPleasure: 6,
            description: "Applying controlled physical sensation. Organizes expression of power.",
          },
          {
            practice: "Receiving impact",
            fantasyPull: 8,
            actualPleasure: 7,
            description: "Experiencing strong sensation. Organizes surrender and intensity.",
          },
          {
            practice: "Biting / scratching",
            fantasyPull: 5,
            actualPleasure: 4,
            description: "Primal physical expression. Organizes animalistic energy.",
          },
          {
            practice: "Choking / neck holding (light, consensual)",
            fantasyPull: 10,
            actualPleasure: 7,
            description:
              "Heightened intensity through trust and risk. Organizes surrender and thrill.",
          },
          {
            practice: "Restraining partner",
            fantasyPull: 9,
            actualPleasure: 6,
            description: "Limiting movement. Organizes control and dominance.",
          },
          {
            practice: "Being restrained",
            fantasyPull: 8,
            actualPleasure: 5,
            description: "Having movement limited. Organizes surrender and focus.",
          },
          {
            practice: "Erotic pain endurance",
            fantasyPull: 10,
            actualPleasure: 8,
            description: "Holding a strong sensation. Organizes challenge and resilience.",
          },
          {
            practice: "Shibari / erotic rope art",
            fantasyPull: 7,
            actualPleasure: 6,
            description: "Aesthetic and emotional restraint. Organizes beauty and surrender.",
          },
        ],
      },
      {
        title: "Erotic Attention, Voyeurism & Third-Party Themes",
        rows: [
          {
            practice: "Being watched by partner",
            fantasyPull: 7,
            actualPleasure: 6,
            description: "Being held in a partner’s desire. Organizes validation and being chosen.",
          },
          {
            practice: "Watching your partner",
            fantasyPull: 7,
            actualPleasure: 7,
            description: "Witnessing their arousal. Organizes empathy and chemistry.",
          },
          {
            practice: "Voyeurism (watching others)",
            fantasyPull: 8,
            actualPleasure: 7,
            description: "Observing from emotional distance. Organizes curiosity and fantasy.",
          },
          {
            practice: "Exhibitionism",
            fantasyPull: 10,
            actualPleasure: 8,
            description: "Being visible to others. Organizes validation and performance.",
          },
          {
            practice: "Public or semi-public play",
            fantasyPull: 10,
            actualPleasure: 7,
            description: "Risk of being discovered. Organizes thrill and taboo.",
          },
          {
            practice: "Public teasing",
            fantasyPull: 8,
            actualPleasure: 8,
            description:
              "Secret intimacy in public. Organizes anticipation and playful connection.",
          },
          {
            practice: "Being watched secretly by partner",
            fantasyPull: 8,
            actualPleasure: 6,
            description: "Being desired without performing. Organizes effortless validation.",
          },
          {
            practice: "Forced voyeurism fantasy",
            fantasyPull: 9,
            actualPleasure: 8,
            description: "Losing control over who sees you. Organizes exposure and powerlessness.",
          },
          {
            practice: "Cuckold (partner with others)",
            fantasyPull: 9,
            actualPleasure: 7,
            description:
              "Eroticized jealousy and loss of status. Organizes insecurity and surrender.",
          },
          {
            practice: "Hotwifing",
            fantasyPull: 9,
            actualPleasure: 9,
            description:
              "Sharing partner to feel pride and reflected desirability. Organizes status and validation.",
          },
          {
            practice: "Group sex / threesomes",
            fantasyPull: 10,
            actualPleasure: 10,
            description: "Multiple streams of desire. Organizes novelty and attention.",
          },
          {
            practice: "Anonymous encounter fantasy",
            fantasyPull: 10,
            actualPleasure: 9,
            description: "Being desired without being known. Organizes freedom from identity.",
          },
        ],
      },
      {
        title: "Fetish, Identity & Body-Focus",
        rows: [
          {
            practice: "Foot fetish",
            fantasyPull: 7,
            actualPleasure: 6,
            description: "Focus on a specific body part. Organizes symbolic attraction.",
          },
          {
            practice: "Hair fetish",
            fantasyPull: 4,
            actualPleasure: 4,
            description: "Arousal from hair. Organizes sensory fixation.",
          },
          {
            practice: "Breasts / nipple play",
            fantasyPull: 4,
            actualPleasure: 3,
            description: "Chest-focused stimulation. Organizes nurturance and pleasure.",
          },
          {
            practice: "Hands / legs / thighs",
            fantasyPull: 4,
            actualPleasure: 5,
            description: "Body-part focus. Organizes visual and tactile attraction.",
          },
          {
            practice: "Voice fetish",
            fantasyPull: 6,
            actualPleasure: 6,
            description: "Arousal from sound. Organizes emotional resonance.",
          },
          {
            practice: "Cross-dressing / gender play",
            fantasyPull: 8,
            actualPleasure: 6,
            description:
              "Wearing or exploring different gendered roles. Organizes identity exploration.",
          },
          {
            practice: "Lingerie / fetish wear",
            fantasyPull: 7,
            actualPleasure: 7,
            description: "Erotic clothing. Organizes display and identity.",
          },
          {
            practice: "Worshipping partner’s body",
            fantasyPull: 6,
            actualPleasure: 7,
            description: "Admiring the partner’s physical form. Organizes devotion.",
          },
        ],
      },
      {
        title: "Taboo, Fluids & Extreme Kink",
        rows: [
          {
            practice: "Cum play",
            fantasyPull: 8,
            actualPleasure: 7,
            description: "Focus on sexual fluids. Organizes taboo and intimacy.",
          },
          {
            practice: "Pee / golden shower",
            fantasyPull: 10,
            actualPleasure: 8,
            description: "Using urine as a taboo element. Organizes transgression.",
          },
          {
            practice: "Scat",
            fantasyPull: 10,
            actualPleasure: 9,
            description: "Using feces as erotic element. Organizes extreme taboo.",
          },
          {
            practice: "Breeding fantasy",
            fantasyPull: 8,
            actualPleasure: 8,
            description: "Imagining impregnation. Organizes fertility and legacy.",
          },
          {
            practice: "Pregnancy play",
            fantasyPull: 9,
            actualPleasure: 7,
            description: "Eroticizing pregnancy. Organizes nurture and taboo.",
          },
          {
            practice: "Lactation play",
            fantasyPull: 7,
            actualPleasure: 7,
            description: "Milk as erotic symbol. Organizes nurturance.",
          },
          {
            practice: "Object insertion",
            fantasyPull: 8,
            actualPleasure: 6,
            description: "Using non-sexual objects. Organizes novelty and taboo.",
          },
          {
            practice: "Food play",
            fantasyPull: 5,
            actualPleasure: 4,
            description: "Using food in erotic context. Organizes sensory transgression.",
          },
        ],
      },
      {
        title: "Technology & Distance",
        rows: [
          {
            practice: "Sexting",
            fantasyPull: 5,
            actualPleasure: 4,
            description: "Sending erotic messages. Organizes anticipation and desire.",
          },
          {
            practice: "Erotic voice / audio",
            fantasyPull: 4,
            actualPleasure: 4,
            description: "Hearing arousing speech. Organizes intimacy through sound.",
          },
          {
            practice: "Erotic photography / filming",
            fantasyPull: 8,
            actualPleasure: 6,
            description: "Recording intimacy. Organizes being desired and remembered.",
          },
          {
            practice: "Mutual video masturbation",
            fantasyPull: 5,
            actualPleasure: 5,
            description: "Remote shared arousal. Organizes chemistry across distance.",
          },
          {
            practice: "Long-distance sexual play",
            fantasyPull: 4,
            actualPleasure: 5,
            description: "Maintaining intimacy when apart. Organizes emotional continuity.",
          },
        ],
      },
      {
        title: "Ritual, Tantra & Conscious Sex",
        rows: [
          {
            practice: "Tantra / spiritual sexuality",
            fantasyPull: 7,
            actualPleasure: 8,
            description: "Presence-based intimacy. Organizes awareness and intensity.",
          },
          {
            practice: "Sacred kink",
            fantasyPull: 8,
            actualPleasure: 8,
            description: "Ritualized erotic power. Organizes aliveness and transformation.",
          },
          {
            practice: "Sensual rituals",
            fantasyPull: 5,
            actualPleasure: 7,
            description: "Structured, intentional intimacy. Organizes focus and chemistry.",
          },
          {
            practice: "Mirror sex",
            fantasyPull: 5,
            actualPleasure: 4,
            description: "Watching oneself and partner. Organizes self-awareness.",
          },
          {
            practice: "Mutual surrender experience",
            fantasyPull: 7,
            actualPleasure: 9,
            description: "Letting go together. Organizes choice and spontaneity and union.",
          },
          {
            practice: "Shadow work through sex",
            fantasyPull: 8,
            actualPleasure: 6,
            description: "Exploring shame or hidden parts. Organizes integration.",
          },
        ],
      },
    ],
  },
  "Relational Nurturer": {
    introBlocks: [
      "<p>These scores <strong>do not define you as an individual</strong>. They are <strong>probability-based estimates derived from aggregated research and observed patterns across archetypes.</strong></p>",
      "<p>They <strong>reflect what is statistically more common, not what is fixed or deterministic for you individually.</strong> Every person is unique, and real-world preferences are shaped by personal experience, context, development, and the combination of multiple archetypes within you.</p>",
      "<p>This means your actual desires, boundaries, and experiences may align with, differ from, or evolve beyond these patterns — sometimes significantly.</p>",
      "<p>We present two separate metrics on a 10-point scale:</p>",
      "<ul><li><strong>Fantasy Pull:</strong> how strongly a theme tends to appear in imagination, curiosity, or arousal</li><li><strong>Lived Pleasure:</strong> how likely the same theme is to feel grounding, pleasurable, and genuinely good when experienced in real life</li></ul>",
      "<p><strong>Fantasy Pull:</strong></p>",
      "<ul><li><strong>High</strong> (7–10): More likely to feel mentally engaging, arousing, or intriguing in imagination.</li><li><strong>Low</strong> (1–4): Less likely to capture attention or appear in imagination arousing.</li></ul>",
      "<p><strong>Actual Pleasure:</strong></p>",
      "<ul><li><strong>High</strong> (7–10): More likely to feel physically and/or emotionally satisfying in real-life experience (given the right context, such as trust and safety).</li><li><strong>Low</strong> (1–4): Less likely to feel rewarding, pleasurable or to resonate strongly in practice</li></ul>",
      "<p><strong>How to read combinations of scores</strong></p>",
      "<p>Because Fantasy Pull and Lived Pleasure are independent, the relationship between them matters. Looking at both together helps you understand how a theme tends to show up in your mind vs. in real experience.</p>",
      "<p><strong>Low Fantasy + Low Pleasure</strong> → Generally not relevant<br />This suggests a theme is neither mentally engaging nor particularly rewarding in practice. Typically something to deprioritize, unless curiosity emerges naturally over time.</p>",
      "<p><strong>Low Fantasy + High Pleasure</strong> → Better in reality than in imagination</p>",
      "<p>You may not think about it much, but when experienced, it can feel surprisingly good or fulfilling. Often worth gently exploring in real-life contexts, as these areas can reveal unexpected compatibility.</p>",
      "<p><strong>High Fantasy + Low Pleasure</strong> → Stronger in imagination than in reality<br />There is a strong mental or symbolic attraction, but less consistent satisfaction in practice. Calls for conscious exploration and adjustment — refining context, pace, or boundaries — or keeping parts of it in fantasy where it feels most aligned.</p>",
      "<p><strong>High Fantasy + High Pleasure</strong> → Alignment between mind and experience<br />What feels exciting in imagination is also likely to feel good in reality. These are areas to lean into and deepen, often representing natural sources of fulfillment and ease.</p>",
    ],
    groups: [
      {
        title: "Core Relational & Embodied",
        rows: [
          {
            practice: "Romantic lovemaking",
            fantasyPull: 7,
            actualPleasure: 9,
            description:
              "Sex centered on affection, tenderness, and feeling emotionally chosen. Organizes secure bonding, emotional security, and mutual care.",
          },
          {
            practice: "Slow build / extended foreplay",
            fantasyPull: 7,
            actualPleasure: 10,
            description:
              "Gradual arousal through time, touch, and anticipation. Organizes co-regulation and support and reliability.",
          },
          {
            practice: "Passionate quickies",
            fantasyPull: 3,
            actualPleasure: 3,
            description:
              "Fast, urgent sex driven by impulse. Organizes warmth, release, and shared growth.",
          },
          {
            practice: "Morning sex",
            fantasyPull: 5,
            actualPleasure: 6,
            description:
              "Gentle or energized intimacy after waking. Organizes comfort, connection, and bodily openness.",
          },
          {
            practice: "Sleeping / wake-up sex",
            fantasyPull: 5,
            actualPleasure: 7,
            description:
              "Intimacy while drifting in or out of sleep. Organizes vulnerability and softness.",
          },
          {
            practice: "After-argument / makeup sex",
            fantasyPull: 5,
            actualPleasure: 5,
            description: "Sex after conflict. Organizes emotional repair and tension discharge.",
          },
          {
            practice: "Romantic aftercare",
            fantasyPull: 7,
            actualPleasure: 8,
            description:
              "Cuddling, closeness, and reassurance after sex. Organizes emotional completion and emotional security.",
          },
          {
            practice: "Emotional vulnerability during sex",
            fantasyPull: 8,
            actualPleasure: 9,
            description:
              "Sharing feelings or being emotionally open while intimate. Organizes being seen and accepted.",
          },
          {
            practice: "Crying or emotional release",
            fantasyPull: 6,
            actualPleasure: 9,
            description:
              "Letting emotions surface during intimacy. Organizes catharsis and relief.",
          },
          {
            practice: "Emotional healing sex",
            fantasyPull: 6,
            actualPleasure: 8,
            description:
              "Using intimacy to soothe or repair emotionally. Organizes co-regulation and support.",
          },
          {
            practice: "Spiritual merging / oneness",
            fantasyPull: 8,
            actualPleasure: 10,
            description:
              "Experiencing sex as a transcendent union. Organizes meaning and connection beyond self.",
          },
        ],
      },
      {
        title: "Touch, Sensory & Body-Based",
        rows: [
          {
            practice: "Sensual massage",
            fantasyPull: 7,
            actualPleasure: 9,
            description:
              "Slow, attentive touch meant to relax and awaken sensation. Organizes emotional security and body awareness.",
          },
          {
            practice: "Erotic massage exchange",
            fantasyPull: 7,
            actualPleasure: 10,
            description:
              "Partners take turns giving sensual touch. Organizes mutual giving and receiving.",
          },
          {
            practice: "Sensory play",
            fantasyPull: 6,
            actualPleasure: 6,
            description:
              "Using textures, sounds, or sensations to heighten awareness. Organizes curiosity and bodily focus.",
          },
          {
            practice: "Sensory deprivation / blindfolds",
            fantasyPull: 3,
            actualPleasure: 2,
            description:
              "Limiting senses to intensify others. Organizes surrender and concentration.",
          },
          {
            practice: "Temperature play",
            fantasyPull: 3,
            actualPleasure: 3,
            description:
              "Using warmth or coolness to stimulate nerves. Organizes shared growth and alertness.",
          },
          {
            practice: "Slow synchronized breathing",
            fantasyPull: 7,
            actualPleasure: 8,
            description: "Breathing together. Organizes co-regulation and calm.",
          },
          {
            practice: "Mutual tantric gaze",
            fantasyPull: 6,
            actualPleasure: 9,
            description: "Holding eye contact for extended time. Organizes emotional presence.",
          },
          {
            practice: "Scent / pheromone play",
            fantasyPull: 5,
            actualPleasure: 6,
            description: "Using smell as an arousal cue. Organizes primal attraction.",
          },
          {
            practice: "Multi-sensory immersion",
            fantasyPull: 8,
            actualPleasure: 9,
            description:
              "Combining sound, touch, smell, and atmosphere. Organizes full-body engagement.",
          },
        ],
      },
      {
        title: "Giving vs Receiving Stimulation",
        rows: [
          {
            practice: "Giving oral",
            fantasyPull: 5,
            actualPleasure: 6,
            description: "Pleasing a partner with a mouth. Organizes caretaking and attentiveness.",
          },
          {
            practice: "Receiving oral",
            fantasyPull: 5,
            actualPleasure: 5,
            description:
              "Being pleasured by a partner’s mouth. Organizes feeling wanted and focused on.",
          },
          {
            practice: "Giving manual stimulation",
            fantasyPull: 5,
            actualPleasure: 7,
            description: "Pleasing a partner with hands. Organizes giving and responsiveness.",
          },
          {
            practice: "Receiving manual stimulation",
            fantasyPull: 5,
            actualPleasure: 4,
            description: "Being pleasured by touch. Organizes being held in erotic attention.",
          },
          {
            practice: "Mutual masturbation",
            fantasyPull: 3,
            actualPleasure: 2,
            description:
              "Both partners pleasure themselves together. Organizes shared presence with autonomy.",
          },
          {
            practice: "Masturbating in front of partner",
            fantasyPull: 3,
            actualPleasure: 1,
            description:
              "Self-pleasure while being watched. Organizes being desired without effort.",
          },
          {
            practice: "Using toys on partner",
            fantasyPull: 3,
            actualPleasure: 3,
            description: "Enhancing their sensation. Organizes caretaking and curiosity.",
          },
          {
            practice: "Having toys used on you",
            fantasyPull: 4,
            actualPleasure: 2,
            description: "Receiving intensified stimulation. Organizes surrender and focus.",
          },
        ],
      },
      {
        title: "Penetration & Body Opening",
        rows: [
          {
            practice: "Penetrating partner",
            fantasyPull: 2,
            actualPleasure: 2,
            description: "Being the active, initiating body. Organizes agency and movement.",
          },
          {
            practice: "Being penetrated",
            fantasyPull: 2,
            actualPleasure: 3,
            description:
              "Allowing the partner inside one’s body. Organizes surrender and openness.",
          },
          {
            practice: "Pegging",
            fantasyPull: 3,
            actualPleasure: 1,
            description:
              "Being penetrated by a partner using a device. Organizes role-reversal and reliability.",
          },
          {
            practice: "Anal play (giving)",
            fantasyPull: 3,
            actualPleasure: 2,
            description: "Stimulating a partner anally. Organizes control and safe vulnerability.",
          },
          {
            practice: "Anal play (receiving)",
            fantasyPull: 4,
            actualPleasure: 1,
            description: "Being anally stimulated. Organizes vulnerability and surrender.",
          },
          {
            practice: "Double-penetration fantasy",
            fantasyPull: 2,
            actualPleasure: 1,
            description:
              "Imagining intense bodily overwhelm. Organizes extremity and fantasy of being overtaken.",
          },
        ],
      },
      {
        title: "Power & Role Dynamics",
        rows: [
          {
            practice: "Dominating",
            fantasyPull: 3,
            actualPleasure: 2,
            description: "Taking charge and directing the encounter. Organizes agency and control.",
          },
          {
            practice: "Submitting",
            fantasyPull: 6,
            actualPleasure: 5,
            description:
              "Letting the partner lead. Organizes reliability and release of responsibility.",
          },
          {
            practice: "Romantic dominance",
            fantasyPull: 6,
            actualPleasure: 4,
            description:
              "Leading in a caring, protective way. Organizes emotional security and attraction.",
          },
          {
            practice: "Service submission",
            fantasyPull: 7,
            actualPleasure: 5,
            description:
              "Showing devotion by pleasing the partner. Organizes caretaking and meaning.",
          },
          {
            practice: "Worshipping partner",
            fantasyPull: 6,
            actualPleasure: 6,
            description:
              "Treating the partner as precious or ideal. Organizes devotion and admiration.",
          },
          {
            practice: "Being worshipped",
            fantasyPull: 5,
            actualPleasure: 6,
            description: "Being idealized and adored. Organizes appreciation and being valued.",
          },
          {
            practice: "Master–slave (consensual)",
            fantasyPull: 3,
            actualPleasure: 1,
            description: "Formalized hierarchy. Organizes identity and protection structure.",
          },
          {
            practice: "Power exchange (24/7 or partial)",
            fantasyPull: 4,
            actualPleasure: 1,
            description: "Maintaining roles inside and outside sex. Organizes lifestyle identity.",
          },
        ],
      },
      {
        title: "Pain, Restraint & Edge",
        rows: [
          {
            practice: "Giving impact (spanking, etc.)",
            fantasyPull: 3,
            actualPleasure: 1,
            description:
              "Applying controlled physical sensation. Organizes expression of protection.",
          },
          {
            practice: "Receiving impact",
            fantasyPull: 4,
            actualPleasure: 1,
            description: "Experiencing strong sensation. Organizes surrender and intensity.",
          },
          {
            practice: "Biting / scratching",
            fantasyPull: 3,
            actualPleasure: 2,
            description: "Primal physical expression. Organizes animalistic energy.",
          },
          {
            practice: "Choking / neck holding (light, consensual)",
            fantasyPull: 2,
            actualPleasure: 1,
            description:
              "Heightened intensity through trust and risk. Organizes surrender and thrill.",
          },
          {
            practice: "Restraining partner",
            fantasyPull: 2,
            actualPleasure: 2,
            description: "Limiting movement. Organizes control and dominance.",
          },
          {
            practice: "Being restrained",
            fantasyPull: 4,
            actualPleasure: 2,
            description: "Having movement limited. Organizes surrender and focus.",
          },
          {
            practice: "Erotic pain endurance",
            fantasyPull: 3,
            actualPleasure: 3,
            description: "Holding a strong sensation. Organizes challenge and resilience.",
          },
          {
            practice: "Shibari / erotic rope art",
            fantasyPull: 5,
            actualPleasure: 1,
            description: "Aesthetic and emotional restraint. Organizes beauty and surrender.",
          },
        ],
      },
      {
        title: "Erotic Attention, Voyeurism & Third-Party Themes",
        rows: [
          {
            practice: "Being watched by partner",
            fantasyPull: 6,
            actualPleasure: 5,
            description:
              "Being held in a partner’s desire. Organizes appreciation and being chosen.",
          },
          {
            practice: "Watching your partner",
            fantasyPull: 6,
            actualPleasure: 6,
            description: "Witnessing their arousal. Organizes empathy and connection.",
          },
          {
            practice: "Voyeurism (watching others)",
            fantasyPull: 3,
            actualPleasure: 1,
            description: "Observing from emotional distance. Organizes curiosity and fantasy.",
          },
          {
            practice: "Exhibitionism",
            fantasyPull: 3,
            actualPleasure: 2,
            description: "Being visible to others. Organizes appreciation and performance.",
          },
          {
            practice: "Public or semi-public play",
            fantasyPull: 4,
            actualPleasure: 1,
            description: "Risk of being discovered. Organizes thrill and safe vulnerability.",
          },
          {
            practice: "Public teasing",
            fantasyPull: 2,
            actualPleasure: 1,
            description: "Secret intimacy in public. Organizes anticipation and mutual care.",
          },
          {
            practice: "Being watched secretly by partner",
            fantasyPull: 2,
            actualPleasure: 2,
            description: "Being desired without performing. Organizes effortless appreciation.",
          },
          {
            practice: "Forced voyeurism fantasy",
            fantasyPull: 4,
            actualPleasure: 2,
            description:
              "Losing control over who sees you. Organizes exposure and protectionlessness.",
          },
          {
            practice: "Cuckold (partner with others)",
            fantasyPull: 3,
            actualPleasure: 3,
            description:
              "Eroticized jealousy and loss of status. Organizes insecurity and surrender.",
          },
          {
            practice: "Hotwifing",
            fantasyPull: 5,
            actualPleasure: 1,
            description:
              "Sharing partner to feel pride and reflected desirability. Organizes status and appreciation.",
          },
          {
            practice: "Group sex / threesomes",
            fantasyPull: 1,
            actualPleasure: 1,
            description: "Multiple streams of desire. Organizes shared growth and attention.",
          },
          {
            practice: "Anonymous encounter fantasy",
            fantasyPull: 1,
            actualPleasure: 3,
            description: "Being desired without being known. Organizes freedom from identity.",
          },
        ],
      },
      {
        title: "Fetish, Identity & Body-Focus",
        rows: [
          {
            practice: "Foot fetish",
            fantasyPull: 3,
            actualPleasure: 1,
            description: "Focus on a specific body part. Organizes symbolic attraction.",
          },
          {
            practice: "Hair fetish",
            fantasyPull: 3,
            actualPleasure: 2,
            description: "Arousal from hair. Organizes sensory fixation.",
          },
          {
            practice: "Breasts / nipple play",
            fantasyPull: 5,
            actualPleasure: 5,
            description: "Chest-focused stimulation. Organizes nurturance and pleasure.",
          },
          {
            practice: "Hands / legs / thighs",
            fantasyPull: 5,
            actualPleasure: 6,
            description: "Body-part focus. Organizes visual and tactile attraction.",
          },
          {
            practice: "Voice fetish",
            fantasyPull: 5,
            actualPleasure: 7,
            description: "Arousal from sound. Organizes emotional resonance.",
          },
          {
            practice: "Cross-dressing / gender play",
            fantasyPull: 4,
            actualPleasure: 1,
            description:
              "Wearing or exploring different gendered roles. Organizes identity exploration.",
          },
          {
            practice: "Lingerie / fetish wear",
            fantasyPull: 6,
            actualPleasure: 6,
            description: "Erotic clothing. Organizes display and identity.",
          },
          {
            practice: "Worshipping partner’s body",
            fantasyPull: 4,
            actualPleasure: 6,
            description: "Admiring the partner’s physical form. Organizes devotion.",
          },
        ],
      },
      {
        title: "Taboo, Fluids & Extreme Kink",
        rows: [
          {
            practice: "Cum play",
            fantasyPull: 3,
            actualPleasure: 1,
            description: "Focus on sexual fluids. Organizes safe vulnerability and intimacy.",
          },
          {
            practice: "Pee / golden shower",
            fantasyPull: 4,
            actualPleasure: 1,
            description: "Using urine as a taboo element. Organizes transgression.",
          },
          {
            practice: "Scat",
            fantasyPull: 2,
            actualPleasure: 1,
            description: "Using feces as erotic element. Organizes extreme safe vulnerability.",
          },
          {
            practice: "Breeding fantasy",
            fantasyPull: 2,
            actualPleasure: 2,
            description: "Imagining impregnation. Organizes fertility and legacy.",
          },
          {
            practice: "Pregnancy play",
            fantasyPull: 4,
            actualPleasure: 2,
            description: "Eroticizing pregnancy. Organizes nurture and safe vulnerability.",
          },
          {
            practice: "Lactation play",
            fantasyPull: 3,
            actualPleasure: 3,
            description: "Milk as erotic symbol. Organizes nurturance.",
          },
          {
            practice: "Object insertion",
            fantasyPull: 5,
            actualPleasure: 1,
            description:
              "Using non-sexual objects. Organizes shared growth and safe vulnerability.",
          },
          {
            practice: "Food play",
            fantasyPull: 3,
            actualPleasure: 2,
            description: "Using food in erotic context. Organizes sensory transgression.",
          },
        ],
      },
      {
        title: "Technology & Distance",
        rows: [
          {
            practice: "Sexting",
            fantasyPull: 3,
            actualPleasure: 2,
            description: "Sending erotic messages. Organizes anticipation and desire.",
          },
          {
            practice: "Erotic voice / audio",
            fantasyPull: 5,
            actualPleasure: 5,
            description: "Hearing arousing speech. Organizes intimacy through sound.",
          },
          {
            practice: "Erotic photography / filming",
            fantasyPull: 3,
            actualPleasure: 1,
            description: "Recording intimacy. Organizes being seen and remembered.",
          },
          {
            practice: "Mutual video masturbation",
            fantasyPull: 4,
            actualPleasure: 1,
            description: "Remote shared arousal. Organizes connection across distance.",
          },
          {
            practice: "Long-distance sexual play",
            fantasyPull: 5,
            actualPleasure: 6,
            description: "Maintaining intimacy when apart. Organizes emotional continuity.",
          },
        ],
      },
      {
        title: "Ritual, Tantra & Conscious Sex",
        rows: [
          {
            practice: "Tantra / spiritual sexuality",
            fantasyPull: 8,
            actualPleasure: 9,
            description: "Presence-based intimacy. Organizes awareness and depth.",
          },
          {
            practice: "Sacred kink",
            fantasyPull: 8,
            actualPleasure: 10,
            description: "Ritualized erotic power. Organizes meaning and transformation.",
          },
          {
            practice: "Sensual rituals",
            fantasyPull: 7,
            actualPleasure: 9,
            description: "Structured, intentional intimacy. Organizes focus and connection.",
          },
          {
            practice: "Mirror sex",
            fantasyPull: 3,
            actualPleasure: 1,
            description: "Watching oneself and partner. Organizes self-awareness.",
          },
          {
            practice: "Mutual surrender experience",
            fantasyPull: 9,
            actualPleasure: 9,
            description: "Letting go together. Organizes reliability and union.",
          },
          {
            practice: "Shadow work through sex",
            fantasyPull: 8,
            actualPleasure: 8,
            description: "Exploring shame or hidden parts. Organizes integration.",
          },
        ],
      },
    ],
  },
  "Radiant Performer": {
    introBlocks: [
      "<p>These scores <strong>do not define you as an individual</strong>. They are <strong>probability-based estimates derived from aggregated research and observed patterns across archetypes.</strong></p>",
      "<p>They <strong>reflect what is statistically more common, not what is fixed or deterministic for you individually.</strong> Every person is unique, and real-world preferences are shaped by personal experience, context, development, and the combination of multiple archetypes within you.</p>",
      "<p>This means your actual desires, boundaries, and experiences may align with, differ from, or evolve beyond these patterns — sometimes significantly.</p>",
      "<p>We present two separate metrics on a 10-point scale:</p>",
      "<ul><li><strong>Fantasy Pull:</strong> how strongly a theme tends to appear in imagination, curiosity, or arousal</li><li><strong>Lived Pleasure:</strong> how likely the same theme is to feel grounding, pleasurable, and genuinely good when experienced in real life</li></ul>",
      "<p><strong>Fantasy Pull:</strong></p>",
      "<ul><li><strong>High</strong> (7–10): More likely to feel mentally engaging, arousing, or intriguing in imagination.</li><li><strong>Low</strong> (1–4): Less likely to capture attention or appear in imagination arousing.</li></ul>",
      "<p><strong>Actual Pleasure:</strong></p>",
      "<ul><li><strong>High</strong> (7–10): More likely to feel physically and/or emotionally satisfying in real-life experience (given the right context, such as trust and safety).</li><li><strong>Low</strong> (1–4): Less likely to feel rewarding, pleasurable or to resonate strongly in practice</li></ul>",
      "<p><strong>How to read combinations of scores</strong></p>",
      "<p>Because Fantasy Pull and Lived Pleasure are independent, the relationship between them matters. Looking at both together helps you understand how a theme tends to show up in your mind vs. in real experience.</p>",
      "<p><strong>Low Fantasy + Low Pleasure</strong> → Generally not relevant<br />This suggests a theme is neither mentally engaging nor particularly rewarding in practice. Typically something to deprioritize, unless curiosity emerges naturally over time.</p>",
      "<p><strong>Low Fantasy + High Pleasure</strong> → Better in reality than in imagination</p>",
      "<p>You may not think about it much, but when experienced, it can feel surprisingly good or fulfilling. Often worth gently exploring in real-life contexts, as these areas can reveal unexpected compatibility.</p>",
      "<p><strong>High Fantasy + Low Pleasure</strong> → Stronger in imagination than in reality<br />There is a strong mental or symbolic attraction, but less consistent satisfaction in practice. Calls for conscious exploration and adjustment — refining context, pace, or boundaries — or keeping parts of it in fantasy where it feels most aligned.</p>",
      "<p><strong>High Fantasy + High Pleasure</strong> → Alignment between mind and experience<br />What feels exciting in imagination is also likely to feel good in reality. These are areas to lean into and deepen, often representing natural sources of fulfillment and ease.</p>",
    ],
    groups: [
      {
        title: "Core Relational & Embodied",
        rows: [
          {
            practice: "Romantic lovemaking",
            fantasyPull: 4,
            actualPleasure: 4,
            description:
              "Sex centered on affection, tenderness, and feeling emotionally chosen. Organizes being wanted, positive feedback, and admiration and connection.",
          },
          {
            practice: "Slow build / extended foreplay",
            fantasyPull: 4,
            actualPleasure: 5,
            description:
              "Gradual arousal through time, touch, and anticipation. Organizes nervous-system regulation and responsiveness.",
          },
          {
            practice: "Passionate quickies",
            fantasyPull: 4,
            actualPleasure: 3,
            description:
              "Fast, urgent sex driven by impulse. Organizes excitement, release, and novelty.",
          },
          {
            practice: "Morning sex",
            fantasyPull: 3,
            actualPleasure: 3,
            description:
              "Gentle or energized intimacy after waking. Organizes comfort, connection, and bodily openness.",
          },
          {
            practice: "Sleeping / wake-up sex",
            fantasyPull: 5,
            actualPleasure: 5,
            description:
              "Intimacy while drifting in or out of sleep. Organizes vulnerability and softness.",
          },
          {
            practice: "After-argument / makeup sex",
            fantasyPull: 5,
            actualPleasure: 3,
            description: "Sex after conflict. Organizes emotional repair and tension discharge.",
          },
          {
            practice: "Romantic aftercare",
            fantasyPull: 5,
            actualPleasure: 4,
            description:
              "Cuddling, closeness, and reassurance after sex. Organizes emotional completion and positive feedback.",
          },
          {
            practice: "Emotional vulnerability during sex",
            fantasyPull: 3,
            actualPleasure: 4,
            description:
              "Sharing feelings or being emotionally open while intimate. Organizes being witnessed and accepted.",
          },
          {
            practice: "Crying or emotional release",
            fantasyPull: 3,
            actualPleasure: 5,
            description:
              "Letting emotions surface during intimacy. Organizes catharsis and relief.",
          },
          {
            practice: "Emotional healing sex",
            fantasyPull: 4,
            actualPleasure: 6,
            description:
              "Using intimacy to soothe or repair emotionally. Organizes nervous-system regulation.",
          },
          {
            practice: "Spiritual merging / oneness",
            fantasyPull: 6,
            actualPleasure: 6,
            description:
              "Experiencing sex as a transcendent union. Organizes meaning and connection beyond self.",
          },
        ],
      },
      {
        title: "Touch, Sensory & Body-Based",
        rows: [
          {
            practice: "Sensual massage",
            fantasyPull: 4,
            actualPleasure: 4,
            description:
              "Slow, attentive touch meant to relax and awaken sensation. Organizes positive feedback and body awareness.",
          },
          {
            practice: "Erotic massage exchange",
            fantasyPull: 4,
            actualPleasure: 5,
            description:
              "Partners take turns giving sensual touch. Organizes mutual giving and receiving.",
          },
          {
            practice: "Sensory play",
            fantasyPull: 6,
            actualPleasure: 4,
            description:
              "Using textures, sounds, or sensations to heighten awareness. Organizes curiosity and bodily focus.",
          },
          {
            practice: "Sensory deprivation / blindfolds",
            fantasyPull: 6,
            actualPleasure: 6,
            description:
              "Limiting senses to intensify others. Organizes surrender and concentration.",
          },
          {
            practice: "Temperature play",
            fantasyPull: 6,
            actualPleasure: 5,
            description:
              "Using warmth or coolness to stimulate nerves. Organizes novelty and alertness.",
          },
          {
            practice: "Slow synchronized breathing",
            fantasyPull: 4,
            actualPleasure: 3,
            description: "Breathing together. Organizes co-regulation and calm.",
          },
          {
            practice: "Mutual tantric gaze",
            fantasyPull: 5,
            actualPleasure: 4,
            description: "Holding eye contact for extended time. Organizes emotional attention.",
          },
          {
            practice: "Scent / pheromone play",
            fantasyPull: 5,
            actualPleasure: 5,
            description: "Using smell as an arousal cue. Organizes primal attraction.",
          },
          {
            practice: "Multi-sensory immersion",
            fantasyPull: 7,
            actualPleasure: 5,
            description:
              "Combining sound, touch, smell, and atmosphere. Organizes full-body engagement.",
          },
        ],
      },
      {
        title: "Giving vs Receiving Stimulation",
        rows: [
          {
            practice: "Giving oral",
            fantasyPull: 3,
            actualPleasure: 3,
            description: "Pleasing a partner with a mouth. Organizes caretaking and attentiveness.",
          },
          {
            practice: "Receiving oral",
            fantasyPull: 3,
            actualPleasure: 4,
            description:
              "Being pleasured by a partner’s mouth. Organizes feeling wanted and focused on.",
          },
          {
            practice: "Giving manual stimulation",
            fantasyPull: 3,
            actualPleasure: 2,
            description: "Pleasing a partner with hands. Organizes giving and responsiveness.",
          },
          {
            practice: "Receiving manual stimulation",
            fantasyPull: 2,
            actualPleasure: 3,
            description: "Being pleasured by touch. Organizes being held in erotic attention.",
          },
          {
            practice: "Mutual masturbation",
            fantasyPull: 4,
            actualPleasure: 3,
            description:
              "Both partners pleasure themselves together. Organizes shared attention with autonomy.",
          },
          {
            practice: "Masturbating in front of partner",
            fantasyPull: 5,
            actualPleasure: 3,
            description:
              "Self-pleasure while being watched. Organizes being desired without effort.",
          },
          {
            practice: "Using toys on partner",
            fantasyPull: 4,
            actualPleasure: 4,
            description: "Enhancing their sensation. Organizes caretaking and curiosity.",
          },
          {
            practice: "Having toys used on you",
            fantasyPull: 4,
            actualPleasure: 2,
            description: "Receiving intensified stimulation. Organizes surrender and focus.",
          },
        ],
      },
      {
        title: "Penetration & Body Opening",
        rows: [
          {
            practice: "Penetrating partner",
            fantasyPull: 2,
            actualPleasure: 2,
            description: "Being the active, initiating body. Organizes agency and movement.",
          },
          {
            practice: "Being penetrated",
            fantasyPull: 2,
            actualPleasure: 3,
            description:
              "Allowing the partner inside one’s body. Organizes surrender and openness.",
          },
          {
            practice: "Pegging",
            fantasyPull: 8,
            actualPleasure: 4,
            description:
              "Being penetrated by a partner using a device. Organizes role-reversal and responsiveness.",
          },
          {
            practice: "Anal play (giving)",
            fantasyPull: 8,
            actualPleasure: 5,
            description: "Stimulating a partner anally. Organizes control and taboo.",
          },
          {
            practice: "Anal play (receiving)",
            fantasyPull: 8,
            actualPleasure: 3,
            description: "Being anally stimulated. Organizes vulnerability and surrender.",
          },
          {
            practice: "Double-penetration fantasy",
            fantasyPull: 10,
            actualPleasure: 7,
            description:
              "Imagining intense bodily overwhelm. Organizes extremity and fantasy of being overtaken.",
          },
        ],
      },
      {
        title: "Power & Role Dynamics",
        rows: [
          {
            practice: "Dominating",
            fantasyPull: 5,
            actualPleasure: 3,
            description: "Taking charge and directing the encounter. Organizes agency and control.",
          },
          {
            practice: "Submitting",
            fantasyPull: 6,
            actualPleasure: 4,
            description:
              "Letting the partner lead. Organizes responsiveness and release of responsibility.",
          },
          {
            practice: "Romantic dominance",
            fantasyPull: 6,
            actualPleasure: 3,
            description:
              "Leading in a caring, protective way. Organizes positive feedback and attraction.",
          },
          {
            practice: "Service submission",
            fantasyPull: 7,
            actualPleasure: 4,
            description:
              "Showing devotion by pleasing the partner. Organizes caretaking and meaning.",
          },
          {
            practice: "Worshipping partner",
            fantasyPull: 6,
            actualPleasure: 5,
            description:
              "Treating the partner as precious or ideal. Organizes worship and admiration.",
          },
          {
            practice: "Being worshipped",
            fantasyPull: 5,
            actualPleasure: 4,
            description: "Being idealized and adored. Organizes desirability and being desired.",
          },
          {
            practice: "Master–slave (consensual)",
            fantasyPull: 10,
            actualPleasure: 4,
            description: "Formalized hierarchy. Organizes identity and power structure.",
          },
          {
            practice: "Power exchange (24/7 or partial)",
            fantasyPull: 10,
            actualPleasure: 5,
            description: "Maintaining roles inside and outside sex. Organizes lifestyle identity.",
          },
        ],
      },
      {
        title: "Pain, Restraint & Edge",
        rows: [
          {
            practice: "Giving impact (spanking, etc.)",
            fantasyPull: 8,
            actualPleasure: 4,
            description: "Applying controlled physical sensation. Organizes expression of power.",
          },
          {
            practice: "Receiving impact",
            fantasyPull: 8,
            actualPleasure: 5,
            description: "Experiencing strong sensation. Organizes surrender and intensity.",
          },
          {
            practice: "Biting / scratching",
            fantasyPull: 5,
            actualPleasure: 4,
            description: "Primal physical expression. Organizes animalistic energy.",
          },
          {
            practice: "Choking / neck holding (light, consensual)",
            fantasyPull: 10,
            actualPleasure: 5,
            description:
              "Heightened intensity through trust and risk. Organizes surrender and thrill.",
          },
          {
            practice: "Restraining partner",
            fantasyPull: 9,
            actualPleasure: 4,
            description: "Limiting movement. Organizes control and dominance.",
          },
          {
            practice: "Being restrained",
            fantasyPull: 7,
            actualPleasure: 4,
            description: "Having movement limited. Organizes surrender and focus.",
          },
          {
            practice: "Erotic pain endurance",
            fantasyPull: 10,
            actualPleasure: 6,
            description: "Holding a strong sensation. Organizes challenge and resilience.",
          },
          {
            practice: "Shibari / erotic rope art",
            fantasyPull: 8,
            actualPleasure: 3,
            description: "Aesthetic and emotional restraint. Organizes beauty and surrender.",
          },
        ],
      },
      {
        title: "Erotic Attention, Voyeurism & Third-Party Themes",
        rows: [
          {
            practice: "Being watched by partner",
            fantasyPull: 6,
            actualPleasure: 4,
            description:
              "Being held in a partner’s desire. Organizes desirability and being chosen.",
          },
          {
            practice: "Watching your partner",
            fantasyPull: 6,
            actualPleasure: 5,
            description: "Witnessing their arousal. Organizes empathy and connection.",
          },
          {
            practice: "Voyeurism (watching others)",
            fantasyPull: 8,
            actualPleasure: 6,
            description: "Observing from emotional distance. Organizes curiosity and fantasy.",
          },
          {
            practice: "Exhibitionism",
            fantasyPull: 10,
            actualPleasure: 6,
            description: "Being visible to others. Organizes desirability and performance.",
          },
          {
            practice: "Public or semi-public play",
            fantasyPull: 10,
            actualPleasure: 5,
            description: "Risk of being discovered. Organizes thrill and taboo.",
          },
          {
            practice: "Public teasing",
            fantasyPull: 8,
            actualPleasure: 5,
            description:
              "Secret intimacy in public. Organizes anticipation and admiration and connection.",
          },
          {
            practice: "Being watched secretly by partner",
            fantasyPull: 8,
            actualPleasure: 4,
            description: "Being desired without performing. Organizes effortless desirability.",
          },
          {
            practice: "Forced voyeurism fantasy",
            fantasyPull: 9,
            actualPleasure: 6,
            description: "Losing control over who sees you. Organizes exposure and powerlessness.",
          },
          {
            practice: "Cuckold (partner with others)",
            fantasyPull: 9,
            actualPleasure: 5,
            description:
              "Eroticized jealousy and loss of status. Organizes insecurity and surrender.",
          },
          {
            practice: "Hotwifing",
            fantasyPull: 9,
            actualPleasure: 7,
            description:
              "Sharing partner to feel pride and reflected desirability. Organizes status and desirability.",
          },
          {
            practice: "Group sex / threesomes",
            fantasyPull: 10,
            actualPleasure: 8,
            description: "Multiple streams of desire. Organizes novelty and attention.",
          },
          {
            practice: "Anonymous encounter fantasy",
            fantasyPull: 10,
            actualPleasure: 7,
            description: "Being desired without being known. Organizes freedom from identity.",
          },
        ],
      },
      {
        title: "Fetish, Identity & Body-Focus",
        rows: [
          {
            practice: "Foot fetish",
            fantasyPull: 6,
            actualPleasure: 5,
            description: "Focus on a specific body part. Organizes symbolic attraction.",
          },
          {
            practice: "Hair fetish",
            fantasyPull: 4,
            actualPleasure: 3,
            description: "Arousal from hair. Organizes sensory fixation.",
          },
          {
            practice: "Breasts / nipple play",
            fantasyPull: 3,
            actualPleasure: 3,
            description: "Chest-focused stimulation. Organizes nurturance and pleasure.",
          },
          {
            practice: "Hands / legs / thighs",
            fantasyPull: 3,
            actualPleasure: 4,
            description: "Body-part focus. Organizes visual and tactile attraction.",
          },
          {
            practice: "Voice fetish",
            fantasyPull: 5,
            actualPleasure: 5,
            description: "Arousal from sound. Organizes emotional resonance.",
          },
          {
            practice: "Cross-dressing / gender play",
            fantasyPull: 8,
            actualPleasure: 4,
            description:
              "Wearing or exploring different gendered roles. Organizes identity exploration.",
          },
          {
            practice: "Lingerie / fetish wear",
            fantasyPull: 6,
            actualPleasure: 6,
            description: "Erotic clothing. Organizes display and identity.",
          },
          {
            practice: "Worshipping partner’s body",
            fantasyPull: 5,
            actualPleasure: 6,
            description: "Admiring the partner’s physical form. Organizes worship.",
          },
        ],
      },
      {
        title: "Taboo, Fluids & Extreme Kink",
        rows: [
          {
            practice: "Cum play",
            fantasyPull: 8,
            actualPleasure: 5,
            description: "Focus on sexual fluids. Organizes taboo and intimacy.",
          },
          {
            practice: "Pee / golden shower",
            fantasyPull: 10,
            actualPleasure: 6,
            description: "Using urine as a taboo element. Organizes transgression.",
          },
          {
            practice: "Scat",
            fantasyPull: 10,
            actualPleasure: 7,
            description: "Using feces as erotic element. Organizes extreme taboo.",
          },
          {
            practice: "Breeding fantasy",
            fantasyPull: 8,
            actualPleasure: 6,
            description: "Imagining impregnation. Organizes fertility and legacy.",
          },
          {
            practice: "Pregnancy play",
            fantasyPull: 9,
            actualPleasure: 5,
            description: "Eroticizing pregnancy. Organizes nurture and taboo.",
          },
          {
            practice: "Lactation play",
            fantasyPull: 7,
            actualPleasure: 5,
            description: "Milk as erotic symbol. Organizes nurturance.",
          },
          {
            practice: "Object insertion",
            fantasyPull: 8,
            actualPleasure: 4,
            description: "Using non-sexual objects. Organizes novelty and taboo.",
          },
          {
            practice: "Food play",
            fantasyPull: 5,
            actualPleasure: 4,
            description: "Using food in erotic context. Organizes sensory transgression.",
          },
        ],
      },
      {
        title: "Technology & Distance",
        rows: [
          {
            practice: "Sexting",
            fantasyPull: 5,
            actualPleasure: 4,
            description: "Sending erotic messages. Organizes anticipation and desire.",
          },
          {
            practice: "Erotic voice / audio",
            fantasyPull: 3,
            actualPleasure: 3,
            description: "Hearing arousing speech. Organizes intimacy through sound.",
          },
          {
            practice: "Erotic photography / filming",
            fantasyPull: 8,
            actualPleasure: 5,
            description: "Recording intimacy. Organizes being witnessed and remembered.",
          },
          {
            practice: "Mutual video masturbation",
            fantasyPull: 5,
            actualPleasure: 3,
            description: "Remote shared arousal. Organizes connection across distance.",
          },
          {
            practice: "Long-distance sexual play",
            fantasyPull: 3,
            actualPleasure: 4,
            description: "Maintaining intimacy when apart. Organizes emotional continuity.",
          },
        ],
      },
      {
        title: "Ritual, Tantra & Conscious Sex",
        rows: [
          {
            practice: "Tantra / spiritual sexuality",
            fantasyPull: 6,
            actualPleasure: 5,
            description: "Presence-based intimacy. Organizes awareness and depth.",
          },
          {
            practice: "Sacred kink",
            fantasyPull: 7,
            actualPleasure: 5,
            description: "Ritualized erotic power. Organizes meaning and transformation.",
          },
          {
            practice: "Sensual rituals",
            fantasyPull: 4,
            actualPleasure: 4,
            description: "Structured, intentional intimacy. Organizes focus and connection.",
          },
          {
            practice: "Mirror sex",
            fantasyPull: 5,
            actualPleasure: 3,
            description: "Watching oneself and partner. Organizes self-awareness.",
          },
          {
            practice: "Mutual surrender experience",
            fantasyPull: 6,
            actualPleasure: 6,
            description: "Letting go together. Organizes responsiveness and union.",
          },
          {
            practice: "Shadow work through sex",
            fantasyPull: 7,
            actualPleasure: 2,
            description: "Exploring shame or hidden parts. Organizes integration.",
          },
        ],
      },
    ],
  },
  "Explorer of Edges": {
    introBlocks: [
      "<p>These scores <strong>do not define you as an individual</strong>. They are <strong>probability-based estimates derived from aggregated research and observed patterns across archetypes.</strong></p>",
      "<p>They <strong>reflect what is statistically more common, not what is fixed or deterministic for you individually.</strong> Every person is unique, and real-world preferences are shaped by personal experience, context, development, and the combination of multiple archetypes within you.</p>",
      "<p>This means your actual desires, boundaries, and experiences may align with, differ from, or evolve beyond these patterns — sometimes significantly.</p>",
      "<p>We present two separate metrics on a 10-point scale:</p>",
      "<ul><li><strong>Fantasy Pull:</strong> how strongly a theme tends to appear in imagination, curiosity, or arousal</li><li><strong>Lived Pleasure:</strong> how likely the same theme is to feel grounding, pleasurable, and genuinely good when experienced in real life</li></ul>",
      "<p><strong>Fantasy Pull:</strong></p>",
      "<ul><li><strong>High</strong> (7–10): More likely to feel mentally engaging, arousing, or intriguing in imagination.</li><li><strong>Low</strong> (1–4): Less likely to capture attention or appear in imagination arousing.</li></ul>",
      "<p><strong>Actual Pleasure:</strong></p>",
      "<ul><li><strong>High</strong> (7–10): More likely to feel physically and/or emotionally satisfying in real-life experience (given the right context, such as trust and safety).</li><li><strong>Low</strong> (1–4): Less likely to feel rewarding, pleasurable or to resonate strongly in practice</li></ul>",
      "<p><strong>How to read combinations of scores</strong></p>",
      "<p>Because Fantasy Pull and Lived Pleasure are independent, the relationship between them matters. Looking at both together helps you understand how a theme tends to show up in your mind vs. in real experience.</p>",
      "<p><strong>Low Fantasy + Low Pleasure</strong> → Generally not relevant<br />This suggests a theme is neither mentally engaging nor particularly rewarding in practice. Typically something to deprioritize, unless curiosity emerges naturally over time.</p>",
      "<p><strong>Low Fantasy + High Pleasure</strong> → Better in reality than in imagination</p>",
      "<p>You may not think about it much, but when experienced, it can feel surprisingly good or fulfilling. Often worth gently exploring in real-life contexts, as these areas can reveal unexpected compatibility.</p>",
      "<p><strong>High Fantasy + Low Pleasure</strong> → Stronger in imagination than in reality<br />There is a strong mental or symbolic attraction, but less consistent satisfaction in practice. Calls for conscious exploration and adjustment — refining context, pace, or boundaries — or keeping parts of it in fantasy where it feels most aligned.</p>",
      "<p><strong>High Fantasy + High Pleasure</strong> → Alignment between mind and experience<br />What feels exciting in imagination is also likely to feel good in reality. These are areas to lean into and deepen, often representing natural sources of fulfillment and ease.</p>",
    ],
    groups: [
      {
        title: "Core Relational & Embodied",
        rows: [
          {
            practice: "Romantic lovemaking",
            fantasyPull: 3,
            actualPleasure: 3,
            description:
              "Sex centered on affection, tenderness, and feeling emotionally chosen. Organizes attachment, consented risk, and intensity bond.",
          },
          {
            practice: "Slow build / extended foreplay",
            fantasyPull: 3,
            actualPleasure: 4,
            description:
              "Gradual arousal through time, touch, and anticipation. Organizes nervous-system regulation and permission.",
          },
          {
            practice: "Passionate quickies",
            fantasyPull: 4,
            actualPleasure: 4,
            description:
              "Fast, urgent sex driven by impulse. Organizes excitement, release, and novelty.",
          },
          {
            practice: "Morning sex",
            fantasyPull: 3,
            actualPleasure: 2,
            description:
              "Gentle or energized intimacy after waking. Organizes thrill, connection, and bodily openness.",
          },
          {
            practice: "Sleeping / wake-up sex",
            fantasyPull: 5,
            actualPleasure: 5,
            description:
              "Intimacy while drifting in or out of sleep. Organizes raw exposure and softness.",
          },
          {
            practice: "After-argument / makeup sex",
            fantasyPull: 5,
            actualPleasure: 2,
            description: "Sex after conflict. Organizes emotional repair and tension discharge.",
          },
          {
            practice: "Romantic aftercare",
            fantasyPull: 4,
            actualPleasure: 3,
            description:
              "Cuddling, closeness, and reassurance after sex. Organizes emotional completion and consented risk.",
          },
          {
            practice: "Emotional vulnerability during sex",
            fantasyPull: 3,
            actualPleasure: 1,
            description:
              "Sharing feelings or being emotionally open while intimate. Organizes being seen and accepted.",
          },
          {
            practice: "Crying or emotional release",
            fantasyPull: 4,
            actualPleasure: 1,
            description:
              "Letting emotions surface during intimacy. Organizes catharsis and relief.",
          },
          {
            practice: "Emotional healing sex",
            fantasyPull: 2,
            actualPleasure: 1,
            description:
              "Using intimacy to soothe or repair emotionally. Organizes nervous-system regulation.",
          },
          {
            practice: "Spiritual merging / oneness",
            fantasyPull: 5,
            actualPleasure: 4,
            description:
              "Experiencing sex as a transcendent union. Organizes transformation and connection beyond self.",
          },
        ],
      },
      {
        title: "Touch, Sensory & Body-Based",
        rows: [
          {
            practice: "Sensual massage",
            fantasyPull: 3,
            actualPleasure: 3,
            description:
              "Slow, attentive touch meant to relax and awaken sensation. Organizes consented risk and body awareness.",
          },
          {
            practice: "Erotic massage exchange",
            fantasyPull: 3,
            actualPleasure: 4,
            description:
              "Partners take turns giving sensual touch. Organizes mutual giving and receiving.",
          },
          {
            practice: "Sensory play",
            fantasyPull: 7,
            actualPleasure: 6,
            description:
              "Using textures, sounds, or sensations to heighten awareness. Organizes curiosity and bodily focus.",
          },
          {
            practice: "Sensory deprivation / blindfolds",
            fantasyPull: 8,
            actualPleasure: 6,
            description:
              "Limiting senses to intensify others. Organizes surrender and concentration.",
          },
          {
            practice: "Temperature play",
            fantasyPull: 8,
            actualPleasure: 7,
            description:
              "Using warmth or coolness to stimulate nerves. Organizes novelty and alertness.",
          },
          {
            practice: "Slow synchronized breathing",
            fantasyPull: 3,
            actualPleasure: 2,
            description: "Breathing together. Organizes co-regulation and calm.",
          },
          {
            practice: "Mutual tantric gaze",
            fantasyPull: 4,
            actualPleasure: 3,
            description: "Holding eye contact for extended time. Organizes emotional presence.",
          },
          {
            practice: "Scent / pheromone play",
            fantasyPull: 5,
            actualPleasure: 5,
            description: "Using smell as an arousal cue. Organizes primal attraction.",
          },
          {
            practice: "Multi-sensory immersion",
            fantasyPull: 5,
            actualPleasure: 6,
            description:
              "Combining sound, touch, smell, and atmosphere. Organizes full-body engagement.",
          },
        ],
      },
      {
        title: "Giving vs Receiving Stimulation",
        rows: [
          {
            practice: "Giving oral",
            fantasyPull: 3,
            actualPleasure: 3,
            description: "Pleasing a partner with a mouth. Organizes caretaking and attentiveness.",
          },
          {
            practice: "Receiving oral",
            fantasyPull: 3,
            actualPleasure: 4,
            description:
              "Being pleasured by a partner’s mouth. Organizes feeling wanted and focused on.",
          },
          {
            practice: "Giving manual stimulation",
            fantasyPull: 3,
            actualPleasure: 2,
            description: "Pleasing a partner with hands. Organizes giving and responsiveness.",
          },
          {
            practice: "Receiving manual stimulation",
            fantasyPull: 4,
            actualPleasure: 3,
            description: "Being pleasured by touch. Organizes being held in erotic attention.",
          },
          {
            practice: "Mutual masturbation",
            fantasyPull: 4,
            actualPleasure: 4,
            description:
              "Both partners pleasure themselves together. Organizes shared presence with autonomy.",
          },
          {
            practice: "Masturbating in front of partner",
            fantasyPull: 6,
            actualPleasure: 5,
            description:
              "Self-pleasure while being watched. Organizes being desired without effort.",
          },
          {
            practice: "Using toys on partner",
            fantasyPull: 4,
            actualPleasure: 5,
            description: "Enhancing their sensation. Organizes caretaking and curiosity.",
          },
          {
            practice: "Having toys used on you",
            fantasyPull: 5,
            actualPleasure: 4,
            description: "Receiving intensified stimulation. Organizes surrender and focus.",
          },
        ],
      },
      {
        title: "Penetration & Body Opening",
        rows: [
          {
            practice: "Penetrating partner",
            fantasyPull: 2,
            actualPleasure: 2,
            description: "Being the active, initiating body. Organizes agency and movement.",
          },
          {
            practice: "Being penetrated",
            fantasyPull: 2,
            actualPleasure: 3,
            description:
              "Allowing the partner inside one’s body. Organizes surrender and openness.",
          },
          {
            practice: "Pegging",
            fantasyPull: 10,
            actualPleasure: 8,
            description:
              "Being penetrated by a partner using a device. Organizes role-reversal and permission.",
          },
          {
            practice: "Anal play (giving)",
            fantasyPull: 10,
            actualPleasure: 9,
            description: "Stimulating a partner anally. Organizes control and taboo.",
          },
          {
            practice: "Anal play (receiving)",
            fantasyPull: 10,
            actualPleasure: 7,
            description: "Being anally stimulated. Organizes raw exposure and surrender.",
          },
          {
            practice: "Double-penetration fantasy",
            fantasyPull: 10,
            actualPleasure: 10,
            description:
              "Imagining intense bodily overwhelm. Organizes extremity and fantasy of being overtaken.",
          },
        ],
      },
      {
        title: "Power & Role Dynamics",
        rows: [
          {
            practice: "Dominating",
            fantasyPull: 6,
            actualPleasure: 5,
            description: "Taking charge and directing the encounter. Organizes agency and control.",
          },
          {
            practice: "Submitting",
            fantasyPull: 7,
            actualPleasure: 4,
            description:
              "Letting the partner lead. Organizes permission and release of responsibility.",
          },
          {
            practice: "Romantic dominance",
            fantasyPull: 7,
            actualPleasure: 5,
            description:
              "Leading in a caring, protective way. Organizes consented risk and attraction.",
          },
          {
            practice: "Service submission",
            fantasyPull: 7,
            actualPleasure: 3,
            description:
              "Showing devotion by pleasing the partner. Organizes caretaking and transformation.",
          },
          {
            practice: "Worshipping partner",
            fantasyPull: 7,
            actualPleasure: 6,
            description:
              "Treating the partner as precious or ideal. Organizes devotion and admiration.",
          },
          {
            practice: "Being worshipped",
            fantasyPull: 5,
            actualPleasure: 5,
            description: "Being idealized and adored. Organizes validation and self-worth.",
          },
          {
            practice: "Master–slave (consensual)",
            fantasyPull: 10,
            actualPleasure: 8,
            description: "Formalized hierarchy. Organizes identity and power structure.",
          },
          {
            practice: "Power exchange (24/7 or partial)",
            fantasyPull: 10,
            actualPleasure: 9,
            description: "Maintaining roles inside and outside sex. Organizes lifestyle identity.",
          },
        ],
      },
      {
        title: "Pain, Restraint & Edge",
        rows: [
          {
            practice: "Giving impact (spanking, etc.)",
            fantasyPull: 10,
            actualPleasure: 8,
            description: "Applying controlled physical sensation. Organizes expression of power.",
          },
          {
            practice: "Receiving impact",
            fantasyPull: 10,
            actualPleasure: 7,
            description: "Experiencing strong sensation. Organizes surrender and intensity.",
          },
          {
            practice: "Biting / scratching",
            fantasyPull: 6,
            actualPleasure: 5,
            description: "Primal physical expression. Organizes animalistic energy.",
          },
          {
            practice: "Choking / neck holding (light, consensual)",
            fantasyPull: 10,
            actualPleasure: 9,
            description:
              "Heightened intensity through trust and risk. Organizes surrender and thrill.",
          },
          {
            practice: "Restraining partner",
            fantasyPull: 10,
            actualPleasure: 6,
            description: "Limiting movement. Organizes control and dominance.",
          },
          {
            practice: "Being restrained",
            fantasyPull: 10,
            actualPleasure: 5,
            description: "Having movement limited. Organizes surrender and focus.",
          },
          {
            practice: "Erotic pain endurance",
            fantasyPull: 10,
            actualPleasure: 10,
            description: "Holding a strong sensation. Organizes challenge and resilience.",
          },
          {
            practice: "Shibari / erotic rope art",
            fantasyPull: 9,
            actualPleasure: 6,
            description: "Aesthetic and emotional restraint. Organizes beauty and surrender.",
          },
        ],
      },
      {
        title: "Erotic Attention, Voyeurism & Third-Party Themes",
        rows: [
          {
            practice: "Being watched by partner",
            fantasyPull: 7,
            actualPleasure: 6,
            description: "Being held in a partner’s desire. Organizes validation and being chosen.",
          },
          {
            practice: "Watching your partner",
            fantasyPull: 7,
            actualPleasure: 7,
            description: "Witnessing their arousal. Organizes empathy and connection.",
          },
          {
            practice: "Voyeurism (watching others)",
            fantasyPull: 10,
            actualPleasure: 9,
            description: "Observing from emotional distance. Organizes curiosity and fantasy.",
          },
          {
            practice: "Exhibitionism",
            fantasyPull: 10,
            actualPleasure: 10,
            description: "Being visible to others. Organizes validation and performance.",
          },
          {
            practice: "Public or semi-public play",
            fantasyPull: 9,
            actualPleasure: 10,
            description: "Risk of being discovered. Organizes thrill and taboo.",
          },
          {
            practice: "Public teasing",
            fantasyPull: 10,
            actualPleasure: 8,
            description: "Secret intimacy in public. Organizes anticipation and intensity bond.",
          },
          {
            practice: "Being watched secretly by partner",
            fantasyPull: 9,
            actualPleasure: 9,
            description: "Being desired without performing. Organizes effortless validation.",
          },
          {
            practice: "Forced voyeurism fantasy",
            fantasyPull: 8,
            actualPleasure: 10,
            description: "Losing control over who sees you. Organizes exposure and powerlessness.",
          },
          {
            practice: "Cuckold (partner with others)",
            fantasyPull: 8,
            actualPleasure: 8,
            description:
              "Eroticized jealousy and loss of status. Organizes insecurity and surrender.",
          },
          {
            practice: "Hotwifing",
            fantasyPull: 10,
            actualPleasure: 7,
            description:
              "Sharing partner to feel pride and reflected desirability. Organizes status and validation.",
          },
          {
            practice: "Group sex / threesomes",
            fantasyPull: 7,
            actualPleasure: 10,
            description: "Multiple streams of desire. Organizes novelty and attention.",
          },
          {
            practice: "Anonymous encounter fantasy",
            fantasyPull: 10,
            actualPleasure: 6,
            description: "Being desired without being known. Organizes freedom from identity.",
          },
        ],
      },
      {
        title: "Fetish, Identity & Body-Focus",
        rows: [
          {
            practice: "Foot fetish",
            fantasyPull: 8,
            actualPleasure: 7,
            description: "Focus on a specific body part. Organizes symbolic attraction.",
          },
          {
            practice: "Hair fetish",
            fantasyPull: 4,
            actualPleasure: 4,
            description: "Arousal from hair. Organizes sensory fixation.",
          },
          {
            practice: "Breasts / nipple play",
            fantasyPull: 3,
            actualPleasure: 3,
            description: "Chest-focused stimulation. Organizes nurturance and pleasure.",
          },
          {
            practice: "Hands / legs / thighs",
            fantasyPull: 3,
            actualPleasure: 4,
            description: "Body-part focus. Organizes visual and tactile attraction.",
          },
          {
            practice: "Voice fetish",
            fantasyPull: 5,
            actualPleasure: 5,
            description: "Arousal from sound. Organizes emotional resonance.",
          },
          {
            practice: "Cross-dressing / gender play",
            fantasyPull: 10,
            actualPleasure: 8,
            description:
              "Wearing or exploring different gendered roles. Organizes identity exploration.",
          },
          {
            practice: "Lingerie / fetish wear",
            fantasyPull: 7,
            actualPleasure: 6,
            description: "Erotic clothing. Organizes display and identity.",
          },
          {
            practice: "Worshipping partner’s body",
            fantasyPull: 5,
            actualPleasure: 6,
            description: "Admiring the partner’s physical form. Organizes devotion.",
          },
        ],
      },
      {
        title: "Taboo, Fluids & Extreme Kink",
        rows: [
          {
            practice: "Cum play",
            fantasyPull: 10,
            actualPleasure: 9,
            description: "Focus on sexual fluids. Organizes taboo and intimacy.",
          },
          {
            practice: "Pee / golden shower",
            fantasyPull: 10,
            actualPleasure: 10,
            description: "Using urine as a taboo element. Organizes transgression.",
          },
          {
            practice: "Scat",
            fantasyPull: 9,
            actualPleasure: 10,
            description: "Using feces as erotic element. Organizes extreme taboo.",
          },
          {
            practice: "Breeding fantasy",
            fantasyPull: 9,
            actualPleasure: 9,
            description: "Imagining impregnation. Organizes fertility and legacy.",
          },
          {
            practice: "Pregnancy play",
            fantasyPull: 9,
            actualPleasure: 8,
            description: "Eroticizing pregnancy. Organizes nurture and taboo.",
          },
          {
            practice: "Lactation play",
            fantasyPull: 10,
            actualPleasure: 7,
            description: "Milk as erotic symbol. Organizes nurturance.",
          },
          {
            practice: "Object insertion",
            fantasyPull: 10,
            actualPleasure: 8,
            description: "Using non-sexual objects. Organizes novelty and taboo.",
          },
          {
            practice: "Food play",
            fantasyPull: 6,
            actualPleasure: 5,
            description: "Using food in erotic context. Organizes sensory transgression.",
          },
        ],
      },
      {
        title: "Technology & Distance",
        rows: [
          {
            practice: "Sexting",
            fantasyPull: 6,
            actualPleasure: 5,
            description: "Sending erotic messages. Organizes anticipation and desire.",
          },
          {
            practice: "Erotic voice / audio",
            fantasyPull: 3,
            actualPleasure: 3,
            description: "Hearing arousing speech. Organizes intimacy through sound.",
          },
          {
            practice: "Erotic photography / filming",
            fantasyPull: 10,
            actualPleasure: 8,
            description: "Recording intimacy. Organizes being seen and remembered.",
          },
          {
            practice: "Mutual video masturbation",
            fantasyPull: 6,
            actualPleasure: 6,
            description: "Remote shared arousal. Organizes connection across distance.",
          },
          {
            practice: "Long-distance sexual play",
            fantasyPull: 3,
            actualPleasure: 4,
            description: "Maintaining intimacy when apart. Organizes emotional continuity.",
          },
        ],
      },
      {
        title: "Ritual, Tantra & Conscious Sex",
        rows: [
          {
            practice: "Tantra / spiritual sexuality",
            fantasyPull: 5,
            actualPleasure: 5,
            description: "Presence-based intimacy. Organizes awareness and depth.",
          },
          {
            practice: "Sacred kink",
            fantasyPull: 7,
            actualPleasure: 4,
            description: "Ritualized erotic power. Organizes transformation and transformation.",
          },
          {
            practice: "Sensual rituals",
            fantasyPull: 3,
            actualPleasure: 3,
            description: "Structured, intentional intimacy. Organizes focus and connection.",
          },
          {
            practice: "Mirror sex",
            fantasyPull: 6,
            actualPleasure: 5,
            description: "Watching oneself and partner. Organizes self-awareness.",
          },
          {
            practice: "Mutual surrender experience",
            fantasyPull: 5,
            actualPleasure: 3,
            description: "Letting go together. Organizes permission and union.",
          },
          {
            practice: "Shadow work through sex",
            fantasyPull: 7,
            actualPleasure: 3,
            description: "Exploring shame or hidden parts. Organizes integration.",
          },
        ],
      },
    ],
  },
  "Curious Apprentice": {
    introBlocks: [
      "<p>These scores <strong>do not define you as an individual</strong>. They are <strong>probability-based estimates derived from aggregated research and observed patterns across archetypes.</strong></p>",
      "<p>They <strong>reflect what is statistically more common, not what is fixed or deterministic for you individually.</strong> Every person is unique, and real-world preferences are shaped by personal experience, context, development, and the combination of multiple archetypes within you.</p>",
      "<p>This means your actual desires, boundaries, and experiences may align with, differ from, or evolve beyond these patterns — sometimes significantly.</p>",
      "<p>We present two separate metrics on a 10-point scale:</p>",
      "<ul><li><strong>Fantasy Pull:</strong> how strongly a theme tends to appear in imagination, curiosity, or arousal</li><li><strong>Lived Pleasure:</strong> how likely the same theme is to feel grounding, pleasurable, and genuinely good when experienced in real life</li></ul>",
      "<p><strong>Fantasy Pull:</strong></p>",
      "<ul><li><strong>High</strong> (7–10): More likely to feel mentally engaging, arousing, or intriguing in imagination.</li><li><strong>Low</strong> (1–4): Less likely to capture attention or appear in imagination arousing.</li></ul>",
      "<p><strong>Actual Pleasure:</strong></p>",
      "<ul><li><strong>High</strong> (7–10): More likely to feel physically and/or emotionally satisfying in real-life experience (given the right context, such as trust and safety).</li><li><strong>Low</strong> (1–4): Less likely to feel rewarding, pleasurable or to resonate strongly in practice</li></ul>",
      "<p><strong>How to read combinations of scores</strong></p>",
      "<p>Because Fantasy Pull and Lived Pleasure are independent, the relationship between them matters. Looking at both together helps you understand how a theme tends to show up in your mind vs. in real experience.</p>",
      "<p><strong>Low Fantasy + Low Pleasure</strong> → Generally not relevant<br />This suggests a theme is neither mentally engaging nor particularly rewarding in practice. Typically something to deprioritize, unless curiosity emerges naturally over time.</p>",
      "<p><strong>Low Fantasy + High Pleasure</strong> → Better in reality than in imagination</p>",
      "<p>You may not think about it much, but when experienced, it can feel surprisingly good or fulfilling. Often worth gently exploring in real-life contexts, as these areas can reveal unexpected compatibility.</p>",
      "<p><strong>High Fantasy + Low Pleasure</strong> → Stronger in imagination than in reality<br />There is a strong mental or symbolic attraction, but less consistent satisfaction in practice. Calls for conscious exploration and adjustment — refining context, pace, or boundaries — or keeping parts of it in fantasy where it feels most aligned.</p>",
      "<p><strong>High Fantasy + High Pleasure</strong> → Alignment between mind and experience<br />What feels exciting in imagination is also likely to feel good in reality. These are areas to lean into and deepen, often representing natural sources of fulfillment and ease.</p>",
    ],
    groups: [
      {
        title: "Core Relational & Embodied",
        rows: [
          {
            practice: "Romantic lovemaking",
            fantasyPull: 5,
            actualPleasure: 7,
            description:
              "Sex centered on affection, tenderness, and feeling emotionally chosen. Organizes attachment, encouragement, and shared learning.",
          },
          {
            practice: "Slow build / extended foreplay",
            fantasyPull: 5,
            actualPleasure: 8,
            description:
              "Gradual arousal through time, touch, and anticipation. Organizes nervous-system regulation and guidance.",
          },
          {
            practice: "Passionate quickies",
            fantasyPull: 4,
            actualPleasure: 4,
            description:
              "Fast, urgent sex driven by impulse. Organizes discovery, release, and experimentation.",
          },
          {
            practice: "Morning sex",
            fantasyPull: 4,
            actualPleasure: 5,
            description:
              "Gentle or energized intimacy after waking. Organizes comfort, connection, and bodily openness.",
          },
          {
            practice: "Sleeping / wake-up sex",
            fantasyPull: 5,
            actualPleasure: 6,
            description:
              "Intimacy while drifting in or out of sleep. Organizes vulnerability and softness.",
          },
          {
            practice: "After-argument / makeup sex",
            fantasyPull: 5,
            actualPleasure: 5,
            description: "Sex after conflict. Organizes emotional repair and tension discharge.",
          },
          {
            practice: "Romantic aftercare",
            fantasyPull: 6,
            actualPleasure: 7,
            description:
              "Cuddling, closeness, and reassurance after sex. Organizes emotional completion and encouragement.",
          },
          {
            practice: "Emotional vulnerability during sex",
            fantasyPull: 6,
            actualPleasure: 6,
            description:
              "Sharing feelings or being emotionally open while intimate. Organizes being seen and accepted.",
          },
          {
            practice: "Crying or emotional release",
            fantasyPull: 4,
            actualPleasure: 6,
            description:
              "Letting emotions surface during intimacy. Organizes catharsis and relief.",
          },
          {
            practice: "Emotional healing sex",
            fantasyPull: 4,
            actualPleasure: 7,
            description:
              "Using intimacy to soothe or repair emotionally. Organizes nervous-system regulation.",
          },
          {
            practice: "Spiritual merging / oneness",
            fantasyPull: 7,
            actualPleasure: 8,
            description:
              "Experiencing sex as a transcendent union. Organizes meaning and connection beyond self.",
          },
        ],
      },
      {
        title: "Touch, Sensory & Body-Based",
        rows: [
          {
            practice: "Sensual massage",
            fantasyPull: 5,
            actualPleasure: 7,
            description:
              "Slow, attentive touch meant to relax and awaken sensation. Organizes encouragement and body awareness.",
          },
          {
            practice: "Erotic massage exchange",
            fantasyPull: 5,
            actualPleasure: 8,
            description:
              "Partners take turns giving sensual touch. Organizes mutual giving and receiving.",
          },
          {
            practice: "Sensory play",
            fantasyPull: 6,
            actualPleasure: 6,
            description:
              "Using textures, sounds, or sensations to heighten awareness. Organizes curiosity and bodily focus.",
          },
          {
            practice: "Sensory deprivation / blindfolds",
            fantasyPull: 6,
            actualPleasure: 7,
            description:
              "Limiting senses to intensify others. Organizes surrender and concentration.",
          },
          {
            practice: "Temperature play",
            fantasyPull: 6,
            actualPleasure: 5,
            description:
              "Using warmth or coolness to stimulate nerves. Organizes experimentation and alertness.",
          },
          {
            practice: "Slow synchronized breathing",
            fantasyPull: 4,
            actualPleasure: 7,
            description: "Breathing together. Organizes co-regulation and calm.",
          },
          {
            practice: "Mutual tantric gaze",
            fantasyPull: 4,
            actualPleasure: 6,
            description: "Holding eye contact for extended time. Organizes emotional presence.",
          },
          {
            practice: "Scent / pheromone play",
            fantasyPull: 5,
            actualPleasure: 6,
            description: "Using smell as an arousal cue. Organizes primal attraction.",
          },
          {
            practice: "Multi-sensory immersion",
            fantasyPull: 7,
            actualPleasure: 8,
            description:
              "Combining sound, touch, smell, and atmosphere. Organizes full-body engagement.",
          },
        ],
      },
      {
        title: "Giving vs Receiving Stimulation",
        rows: [
          {
            practice: "Giving oral",
            fantasyPull: 4,
            actualPleasure: 5,
            description: "Pleasing a partner with a mouth. Organizes caretaking and attentiveness.",
          },
          {
            practice: "Receiving oral",
            fantasyPull: 4,
            actualPleasure: 4,
            description:
              "Being pleasured by a partner’s mouth. Organizes feeling wanted and focused on.",
          },
          {
            practice: "Giving manual stimulation",
            fantasyPull: 4,
            actualPleasure: 6,
            description: "Pleasing a partner with hands. Organizes giving and responsiveness.",
          },
          {
            practice: "Receiving manual stimulation",
            fantasyPull: 5,
            actualPleasure: 4,
            description: "Being pleasured by touch. Organizes being held in erotic attention.",
          },
          {
            practice: "Mutual masturbation",
            fantasyPull: 4,
            actualPleasure: 3,
            description:
              "Both partners pleasure themselves together. Organizes shared presence with autonomy.",
          },
          {
            practice: "Masturbating in front of partner",
            fantasyPull: 5,
            actualPleasure: 3,
            description:
              "Self-pleasure while being watched. Organizes being desired without effort.",
          },
          {
            practice: "Using toys on partner",
            fantasyPull: 3,
            actualPleasure: 4,
            description: "Enhancing their sensation. Organizes caretaking and curiosity.",
          },
          {
            practice: "Having toys used on you",
            fantasyPull: 4,
            actualPleasure: 2,
            description: "Receiving intensified stimulation. Organizes surrender and focus.",
          },
        ],
      },
      {
        title: "Penetration & Body Opening",
        rows: [
          {
            practice: "Penetrating partner",
            fantasyPull: 2,
            actualPleasure: 2,
            description: "Being the active, initiating body. Organizes agency and movement.",
          },
          {
            practice: "Being penetrated",
            fantasyPull: 2,
            actualPleasure: 3,
            description:
              "Allowing the partner inside one’s body. Organizes surrender and openness.",
          },
          {
            practice: "Pegging",
            fantasyPull: 8,
            actualPleasure: 5,
            description:
              "Being penetrated by a partner using a device. Organizes role-reversal and guidance.",
          },
          {
            practice: "Anal play (giving)",
            fantasyPull: 8,
            actualPleasure: 6,
            description: "Stimulating a partner anally. Organizes control and taboo.",
          },
          {
            practice: "Anal play (receiving)",
            fantasyPull: 8,
            actualPleasure: 4,
            description: "Being anally stimulated. Organizes vulnerability and surrender.",
          },
          {
            practice: "Double-penetration fantasy",
            fantasyPull: 10,
            actualPleasure: 8,
            description:
              "Imagining intense bodily overwhelm. Organizes extremity and fantasy of being overtaken.",
          },
        ],
      },
      {
        title: "Power & Role Dynamics",
        rows: [
          {
            practice: "Dominating",
            fantasyPull: 5,
            actualPleasure: 4,
            description: "Taking charge and directing the encounter. Organizes agency and control.",
          },
          {
            practice: "Submitting",
            fantasyPull: 6,
            actualPleasure: 6,
            description:
              "Letting the partner lead. Organizes guidance and release of responsibility.",
          },
          {
            practice: "Romantic dominance",
            fantasyPull: 6,
            actualPleasure: 7,
            description:
              "Leading in a caring, protective way. Organizes encouragement and attraction.",
          },
          {
            practice: "Service submission",
            fantasyPull: 6,
            actualPleasure: 5,
            description:
              "Showing devotion by pleasing the partner. Organizes caretaking and meaning.",
          },
          {
            practice: "Worshipping partner",
            fantasyPull: 7,
            actualPleasure: 6,
            description:
              "Treating the partner as precious or ideal. Organizes devotion and admiration.",
          },
          {
            practice: "Being worshipped",
            fantasyPull: 5,
            actualPleasure: 6,
            description: "Being idealized and adored. Organizes confidence and competence.",
          },
          {
            practice: "Master–slave (consensual)",
            fantasyPull: 10,
            actualPleasure: 6,
            description: "Formalized hierarchy. Organizes identity and power structure.",
          },
          {
            practice: "Power exchange (24/7 or partial)",
            fantasyPull: 10,
            actualPleasure: 7,
            description: "Maintaining roles inside and outside sex. Organizes lifestyle identity.",
          },
        ],
      },
      {
        title: "Pain, Restraint & Edge",
        rows: [
          {
            practice: "Giving impact (spanking, etc.)",
            fantasyPull: 8,
            actualPleasure: 5,
            description: "Applying controlled physical sensation. Organizes expression of power.",
          },
          {
            practice: "Receiving impact",
            fantasyPull: 8,
            actualPleasure: 6,
            description: "Experiencing strong sensation. Organizes surrender and intensity.",
          },
          {
            practice: "Biting / scratching",
            fantasyPull: 5,
            actualPleasure: 4,
            description: "Primal physical expression. Organizes animalistic energy.",
          },
          {
            practice: "Choking / neck holding (light, consensual)",
            fantasyPull: 10,
            actualPleasure: 7,
            description:
              "Heightened intensity through trust and risk. Organizes surrender and thrill.",
          },
          {
            practice: "Restraining partner",
            fantasyPull: 8,
            actualPleasure: 4,
            description: "Limiting movement. Organizes control and dominance.",
          },
          {
            practice: "Being restrained",
            fantasyPull: 9,
            actualPleasure: 5,
            description: "Having movement limited. Organizes surrender and focus.",
          },
          {
            practice: "Erotic pain endurance",
            fantasyPull: 10,
            actualPleasure: 8,
            description: "Holding a strong sensation. Organizes challenge and resilience.",
          },
          {
            practice: "Shibari / erotic rope art",
            fantasyPull: 7,
            actualPleasure: 5,
            description: "Aesthetic and emotional restraint. Organizes beauty and surrender.",
          },
        ],
      },
      {
        title: "Erotic Attention, Voyeurism & Third-Party Themes",
        rows: [
          {
            practice: "Being watched by partner",
            fantasyPull: 6,
            actualPleasure: 6,
            description: "Being held in a partner’s desire. Organizes confidence and being chosen.",
          },
          {
            practice: "Watching your partner",
            fantasyPull: 6,
            actualPleasure: 7,
            description: "Witnessing their arousal. Organizes empathy and connection.",
          },
          {
            practice: "Voyeurism (watching others)",
            fantasyPull: 8,
            actualPleasure: 6,
            description: "Observing from emotional distance. Organizes curiosity and fantasy.",
          },
          {
            practice: "Exhibitionism",
            fantasyPull: 10,
            actualPleasure: 7,
            description: "Being visible to others. Organizes confidence and performance.",
          },
          {
            practice: "Public or semi-public play",
            fantasyPull: 10,
            actualPleasure: 6,
            description: "Risk of being discovered. Organizes thrill and taboo.",
          },
          {
            practice: "Public teasing",
            fantasyPull: 8,
            actualPleasure: 7,
            description: "Secret intimacy in public. Organizes anticipation and shared learning.",
          },
          {
            practice: "Being watched secretly by partner",
            fantasyPull: 8,
            actualPleasure: 5,
            description: "Being desired without performing. Organizes effortless confidence.",
          },
          {
            practice: "Forced voyeurism fantasy",
            fantasyPull: 9,
            actualPleasure: 7,
            description: "Losing control over who sees you. Organizes exposure and powerlessness.",
          },
          {
            practice: "Cuckold (partner with others)",
            fantasyPull: 9,
            actualPleasure: 6,
            description:
              "Eroticized jealousy and loss of status. Organizes insecurity and surrender.",
          },
          {
            practice: "Hotwifing",
            fantasyPull: 9,
            actualPleasure: 8,
            description:
              "Sharing partner to feel pride and reflected desirability. Organizes status and confidence.",
          },
          {
            practice: "Group sex / threesomes",
            fantasyPull: 10,
            actualPleasure: 9,
            description: "Multiple streams of desire. Organizes experimentation and attention.",
          },
          {
            practice: "Anonymous encounter fantasy",
            fantasyPull: 10,
            actualPleasure: 8,
            description: "Being desired without being known. Organizes freedom from identity.",
          },
        ],
      },
      {
        title: "Fetish, Identity & Body-Focus",
        rows: [
          {
            practice: "Foot fetish",
            fantasyPull: 6,
            actualPleasure: 5,
            description: "Focus on a specific body part. Organizes symbolic attraction.",
          },
          {
            practice: "Hair fetish",
            fantasyPull: 4,
            actualPleasure: 3,
            description: "Arousal from hair. Organizes sensory fixation.",
          },
          {
            practice: "Breasts / nipple play",
            fantasyPull: 4,
            actualPleasure: 4,
            description: "Chest-focused stimulation. Organizes nurturance and pleasure.",
          },
          {
            practice: "Hands / legs / thighs",
            fantasyPull: 4,
            actualPleasure: 5,
            description: "Body-part focus. Organizes visual and tactile attraction.",
          },
          {
            practice: "Voice fetish",
            fantasyPull: 5,
            actualPleasure: 6,
            description: "Arousal from sound. Organizes emotional resonance.",
          },
          {
            practice: "Cross-dressing / gender play",
            fantasyPull: 8,
            actualPleasure: 5,
            description:
              "Wearing or exploring different gendered roles. Organizes identity exploration.",
          },
          {
            practice: "Lingerie / fetish wear",
            fantasyPull: 6,
            actualPleasure: 6,
            description: "Erotic clothing. Organizes display and identity.",
          },
          {
            practice: "Worshipping partner’s body",
            fantasyPull: 5,
            actualPleasure: 7,
            description: "Admiring the partner’s physical form. Organizes devotion.",
          },
        ],
      },
      {
        title: "Taboo, Fluids & Extreme Kink",
        rows: [
          {
            practice: "Cum play",
            fantasyPull: 8,
            actualPleasure: 6,
            description: "Focus on sexual fluids. Organizes taboo and intimacy.",
          },
          {
            practice: "Pee / golden shower",
            fantasyPull: 10,
            actualPleasure: 7,
            description: "Using urine as a taboo element. Organizes transgression.",
          },
          {
            practice: "Scat",
            fantasyPull: 10,
            actualPleasure: 8,
            description: "Using feces as erotic element. Organizes extreme taboo.",
          },
          {
            practice: "Breeding fantasy",
            fantasyPull: 8,
            actualPleasure: 7,
            description: "Imagining impregnation. Organizes fertility and legacy.",
          },
          {
            practice: "Pregnancy play",
            fantasyPull: 9,
            actualPleasure: 6,
            description: "Eroticizing pregnancy. Organizes nurture and taboo.",
          },
          {
            practice: "Lactation play",
            fantasyPull: 7,
            actualPleasure: 6,
            description: "Milk as erotic symbol. Organizes nurturance.",
          },
          {
            practice: "Object insertion",
            fantasyPull: 8,
            actualPleasure: 5,
            description: "Using non-sexual objects. Organizes experimentation and taboo.",
          },
          {
            practice: "Food play",
            fantasyPull: 5,
            actualPleasure: 4,
            description: "Using food in erotic context. Organizes sensory transgression.",
          },
        ],
      },
      {
        title: "Technology & Distance",
        rows: [
          {
            practice: "Sexting",
            fantasyPull: 5,
            actualPleasure: 4,
            description: "Sending erotic messages. Organizes anticipation and desire.",
          },
          {
            practice: "Erotic voice / audio",
            fantasyPull: 4,
            actualPleasure: 4,
            description: "Hearing arousing speech. Organizes intimacy through sound.",
          },
          {
            practice: "Erotic photography / filming",
            fantasyPull: 8,
            actualPleasure: 5,
            description: "Recording intimacy. Organizes being seen and remembered.",
          },
          {
            practice: "Mutual video masturbation",
            fantasyPull: 5,
            actualPleasure: 3,
            description: "Remote shared arousal. Organizes connection across distance.",
          },
          {
            practice: "Long-distance sexual play",
            fantasyPull: 4,
            actualPleasure: 5,
            description: "Maintaining intimacy when apart. Organizes emotional continuity.",
          },
        ],
      },
      {
        title: "Ritual, Tantra & Conscious Sex",
        rows: [
          {
            practice: "Tantra / spiritual sexuality",
            fantasyPull: 7,
            actualPleasure: 8,
            description: "Presence-based intimacy. Organizes awareness and depth.",
          },
          {
            practice: "Sacred kink",
            fantasyPull: 8,
            actualPleasure: 8,
            description: "Ritualized erotic power. Organizes meaning and transformation.",
          },
          {
            practice: "Sensual rituals",
            fantasyPull: 5,
            actualPleasure: 7,
            description: "Structured, intentional intimacy. Organizes focus and connection.",
          },
          {
            practice: "Mirror sex",
            fantasyPull: 5,
            actualPleasure: 3,
            description: "Watching oneself and partner. Organizes self-awareness.",
          },
          {
            practice: "Mutual surrender experience",
            fantasyPull: 7,
            actualPleasure: 9,
            description: "Letting go together. Organizes guidance and union.",
          },
          {
            practice: "Shadow work through sex",
            fantasyPull: 8,
            actualPleasure: 7,
            description: "Exploring shame or hidden parts. Organizes integration.",
          },
        ],
      },
    ],
  },
  "Spiritual Lover": {
    introBlocks: [
      "<p>These scores <strong>do not define you as an individual</strong>. They are <strong>probability-based estimates derived from aggregated research and observed patterns across archetypes.</strong></p>",
      "<p>They <strong>reflect what is statistically more common, not what is fixed or deterministic for you individually.</strong> Every person is unique, and real-world preferences are shaped by personal experience, context, development, and the combination of multiple archetypes within you.</p>",
      "<p>This means your actual desires, boundaries, and experiences may align with, differ from, or evolve beyond these patterns — sometimes significantly.</p>",
      "<p>We present two separate metrics on a 10-point scale:</p>",
      "<ul><li><strong>Fantasy Pull:</strong> how strongly a theme tends to appear in imagination, curiosity, or arousal</li><li><strong>Lived Pleasure:</strong> how likely the same theme is to feel grounding, pleasurable, and genuinely good when experienced in real life</li></ul>",
      "<p><strong>Fantasy Pull:</strong></p>",
      "<ul><li><strong>High</strong> (7–10): More likely to feel mentally engaging, arousing, or intriguing in imagination.</li><li><strong>Low</strong> (1–4): Less likely to capture attention or appear in imagination arousing.</li></ul>",
      "<p><strong>Actual Pleasure:</strong></p>",
      "<ul><li><strong>High</strong> (7–10): More likely to feel physically and/or emotionally satisfying in real-life experience (given the right context, such as trust and safety).</li><li><strong>Low</strong> (1–4): Less likely to feel rewarding, pleasurable or to resonate strongly in practice</li></ul>",
      "<p><strong>How to read combinations of scores</strong></p>",
      "<p>Because Fantasy Pull and Lived Pleasure are independent, the relationship between them matters. Looking at both together helps you understand how a theme tends to show up in your mind vs. in real experience.</p>",
      "<p><strong>Low Fantasy + Low Pleasure</strong> → Generally not relevant<br />This suggests a theme is neither mentally engaging nor particularly rewarding in practice. Typically something to deprioritize, unless curiosity emerges naturally over time.</p>",
      "<p><strong>Low Fantasy + High Pleasure</strong> → Better in reality than in imagination</p>",
      "<p>You may not think about it much, but when experienced, it can feel surprisingly good or fulfilling. Often worth gently exploring in real-life contexts, as these areas can reveal unexpected compatibility.</p>",
      "<p><strong>High Fantasy + Low Pleasure</strong> → Stronger in imagination than in reality<br />There is a strong mental or symbolic attraction, but less consistent satisfaction in practice. Calls for conscious exploration and adjustment — refining context, pace, or boundaries — or keeping parts of it in fantasy where it feels most aligned.</p>",
      "<p><strong>High Fantasy + High Pleasure</strong> → Alignment between mind and experience<br />What feels exciting in imagination is also likely to feel good in reality. These are areas to lean into and deepen, often representing natural sources of fulfillment and ease.</p>",
    ],
    groups: [
      {
        title: "Core Relational & Embodied",
        rows: [
          {
            practice: "Romantic lovemaking",
            fantasyPull: 7,
            actualPleasure: 9,
            description:
              "Sex centered on affection, tenderness, and feeling emotionally chosen. Organizes attachment, presence, and oneness.",
          },
          {
            practice: "Slow build / extended foreplay",
            fantasyPull: 7,
            actualPleasure: 10,
            description:
              "Gradual arousal through time, touch, and anticipation. Organizes nervous-system regulation and surrender.",
          },
          {
            practice: "Passionate quickies",
            fantasyPull: 3,
            actualPleasure: 3,
            description:
              "Fast, urgent sex driven by impulse. Organizes transcendence, release, and sacredness.",
          },
          {
            practice: "Morning sex",
            fantasyPull: 5,
            actualPleasure: 6,
            description:
              "Gentle or energized intimacy after waking. Organizes comfort, oneness, and bodily openness.",
          },
          {
            practice: "Sleeping / wake-up sex",
            fantasyPull: 6,
            actualPleasure: 7,
            description:
              "Intimacy while drifting in or out of sleep. Organizes vulnerability and softness.",
          },
          {
            practice: "After-argument / makeup sex",
            fantasyPull: 5,
            actualPleasure: 5,
            description: "Sex after conflict. Organizes emotional repair and tension discharge.",
          },
          {
            practice: "Romantic aftercare",
            fantasyPull: 7,
            actualPleasure: 8,
            description:
              "Cuddling, closeness, and reassurance after sex. Organizes emotional completion and presence.",
          },
          {
            practice: "Emotional vulnerability during sex",
            fantasyPull: 8,
            actualPleasure: 9,
            description:
              "Sharing feelings or being emotionally open while intimate. Organizes being seen and accepted.",
          },
          {
            practice: "Crying or emotional release",
            fantasyPull: 6,
            actualPleasure: 9,
            description:
              "Letting emotions surface during intimacy. Organizes catharsis and relief.",
          },
          {
            practice: "Emotional healing sex",
            fantasyPull: 6,
            actualPleasure: 8,
            description:
              "Using intimacy to soothe or repair emotionally. Organizes nervous-system regulation.",
          },
          {
            practice: "Spiritual merging / oneness",
            fantasyPull: 8,
            actualPleasure: 10,
            description:
              "Experiencing sex as a transcendent union. Organizes sacred connection and oneness beyond self.",
          },
        ],
      },
      {
        title: "Touch, Sensory & Body-Based",
        rows: [
          {
            practice: "Sensual massage",
            fantasyPull: 7,
            actualPleasure: 9,
            description:
              "Slow, attentive touch meant to relax and awaken sensation. Organizes presence and body awareness.",
          },
          {
            practice: "Erotic massage exchange",
            fantasyPull: 7,
            actualPleasure: 10,
            description:
              "Partners take turns giving sensual touch. Organizes mutual giving and receiving.",
          },
          {
            practice: "Sensory play",
            fantasyPull: 6,
            actualPleasure: 6,
            description:
              "Using textures, sounds, or sensations to heighten awareness. Organizes curiosity and bodily focus.",
          },
          {
            practice: "Sensory deprivation / blindfolds",
            fantasyPull: 3,
            actualPleasure: 2,
            description:
              "Limiting senses to intensify others. Organizes surrender and concentration.",
          },
          {
            practice: "Temperature play",
            fantasyPull: 3,
            actualPleasure: 3,
            description:
              "Using warmth or coolness to stimulate nerves. Organizes sacredness and alertness.",
          },
          {
            practice: "Slow synchronized breathing",
            fantasyPull: 7,
            actualPleasure: 8,
            description: "Breathing together. Organizes co-regulation and calm.",
          },
          {
            practice: "Mutual tantric gaze",
            fantasyPull: 8,
            actualPleasure: 9,
            description: "Holding eye contact for extended time. Organizes emotional presence.",
          },
          {
            practice: "Scent / pheromone play",
            fantasyPull: 6,
            actualPleasure: 7,
            description: "Using smell as an arousal cue. Organizes primal attraction.",
          },
          {
            practice: "Multi-sensory immersion",
            fantasyPull: 8,
            actualPleasure: 10,
            description:
              "Combining sound, touch, smell, and atmosphere. Organizes full-body engagement.",
          },
        ],
      },
      {
        title: "Giving vs Receiving Stimulation",
        rows: [
          {
            practice: "Giving oral",
            fantasyPull: 5,
            actualPleasure: 6,
            description: "Pleasing a partner with a mouth. Organizes caretaking and attentiveness.",
          },
          {
            practice: "Receiving oral",
            fantasyPull: 5,
            actualPleasure: 7,
            description:
              "Being pleasured by a partner’s mouth. Organizes feeling wanted and focused on.",
          },
          {
            practice: "Giving manual stimulation",
            fantasyPull: 5,
            actualPleasure: 5,
            description: "Pleasing a partner with hands. Organizes giving and responsiveness.",
          },
          {
            practice: "Receiving manual stimulation",
            fantasyPull: 6,
            actualPleasure: 6,
            description: "Being pleasured by touch. Organizes being held in erotic attention.",
          },
          {
            practice: "Mutual masturbation",
            fantasyPull: 3,
            actualPleasure: 3,
            description:
              "Both partners pleasure themselves together. Organizes shared presence with autonomy.",
          },
          {
            practice: "Masturbating in front of partner",
            fantasyPull: 3,
            actualPleasure: 2,
            description:
              "Self-pleasure while being watched. Organizes being desired without effort.",
          },
          {
            practice: "Using toys on partner",
            fantasyPull: 3,
            actualPleasure: 4,
            description: "Enhancing their sensation. Organizes caretaking and curiosity.",
          },
          {
            practice: "Having toys used on you",
            fantasyPull: 4,
            actualPleasure: 3,
            description: "Receiving intensified stimulation. Organizes surrender and focus.",
          },
        ],
      },
      {
        title: "Penetration & Body Opening",
        rows: [
          {
            practice: "Penetrating partner",
            fantasyPull: 2,
            actualPleasure: 2,
            description: "Being the active, initiating body. Organizes agency and movement.",
          },
          {
            practice: "Being penetrated",
            fantasyPull: 2,
            actualPleasure: 3,
            description:
              "Allowing the partner inside one’s body. Organizes surrender and openness.",
          },
          {
            practice: "Pegging",
            fantasyPull: 3,
            actualPleasure: 2,
            description:
              "Being penetrated by a partner using a device. Organizes role-reversal and surrender.",
          },
          {
            practice: "Anal play (giving)",
            fantasyPull: 3,
            actualPleasure: 3,
            description: "Stimulating a partner anally. Organizes control and taboo.",
          },
          {
            practice: "Anal play (receiving)",
            fantasyPull: 3,
            actualPleasure: 1,
            description: "Being anally stimulated. Organizes vulnerability and surrender.",
          },
          {
            practice: "Double-penetration fantasy",
            fantasyPull: 4,
            actualPleasure: 2,
            description:
              "Imagining intense bodily overwhelm. Organizes extremity and fantasy of being overtaken.",
          },
        ],
      },
      {
        title: "Power & Role Dynamics",
        rows: [
          {
            practice: "Dominating",
            fantasyPull: 3,
            actualPleasure: 2,
            description: "Taking charge and directing the encounter. Organizes agency and control.",
          },
          {
            practice: "Submitting",
            fantasyPull: 6,
            actualPleasure: 6,
            description:
              "Letting the partner lead. Organizes surrender and release of responsibility.",
          },
          {
            practice: "Romantic dominance",
            fantasyPull: 6,
            actualPleasure: 7,
            description: "Leading in a caring, protective way. Organizes presence and attraction.",
          },
          {
            practice: "Service submission",
            fantasyPull: 6,
            actualPleasure: 5,
            description:
              "Showing devotion by pleasing the partner. Organizes caretaking and sacred connection.",
          },
          {
            practice: "Worshipping partner",
            fantasyPull: 7,
            actualPleasure: 6,
            description:
              "Treating the partner as precious or ideal. Organizes devotion and admiration.",
          },
          {
            practice: "Being worshipped",
            fantasyPull: 5,
            actualPleasure: 6,
            description: "Being idealized and adored. Organizes devotion and self-worth.",
          },
          {
            practice: "Master–slave (consensual)",
            fantasyPull: 4,
            actualPleasure: 1,
            description:
              "Formalized hierarchy. Organizes identity and energetic polarity structure.",
          },
          {
            practice: "Power exchange (24/7 or partial)",
            fantasyPull: 4,
            actualPleasure: 2,
            description: "Maintaining roles inside and outside sex. Organizes lifestyle identity.",
          },
        ],
      },
      {
        title: "Pain, Restraint & Edge",
        rows: [
          {
            practice: "Giving impact (spanking, etc.)",
            fantasyPull: 3,
            actualPleasure: 2,
            description:
              "Applying controlled physical sensation. Organizes expression of energetic polarity.",
          },
          {
            practice: "Receiving impact",
            fantasyPull: 3,
            actualPleasure: 3,
            description: "Experiencing strong sensation. Organizes surrender and intensity.",
          },
          {
            practice: "Biting / scratching",
            fantasyPull: 4,
            actualPleasure: 2,
            description: "Primal physical expression. Organizes animalistic energy.",
          },
          {
            practice: "Choking / neck holding (light, consensual)",
            fantasyPull: 4,
            actualPleasure: 1,
            description:
              "Heightened intensity through trust and risk. Organizes surrender and thrill.",
          },
          {
            practice: "Restraining partner",
            fantasyPull: 2,
            actualPleasure: 2,
            description: "Limiting movement. Organizes control and dominance.",
          },
          {
            practice: "Being restrained",
            fantasyPull: 2,
            actualPleasure: 1,
            description: "Having movement limited. Organizes surrender and focus.",
          },
          {
            practice: "Erotic pain endurance",
            fantasyPull: 5,
            actualPleasure: 1,
            description: "Holding a strong sensation. Organizes challenge and resilience.",
          },
          {
            practice: "Shibari / erotic rope art",
            fantasyPull: 3,
            actualPleasure: 1,
            description: "Aesthetic and emotional restraint. Organizes beauty and surrender.",
          },
        ],
      },
      {
        title: "Erotic Attention, Voyeurism & Third-Party Themes",
        rows: [
          {
            practice: "Being watched by partner",
            fantasyPull: 6,
            actualPleasure: 6,
            description: "Being held in a partner’s desire. Organizes devotion and being chosen.",
          },
          {
            practice: "Watching your partner",
            fantasyPull: 6,
            actualPleasure: 7,
            description: "Witnessing their arousal. Organizes empathy and oneness.",
          },
          {
            practice: "Voyeurism (watching others)",
            fantasyPull: 3,
            actualPleasure: 2,
            description: "Observing from emotional distance. Organizes curiosity and fantasy.",
          },
          {
            practice: "Exhibitionism",
            fantasyPull: 4,
            actualPleasure: 1,
            description: "Being visible to others. Organizes devotion and performance.",
          },
          {
            practice: "Public or semi-public play",
            fantasyPull: 5,
            actualPleasure: 1,
            description: "Risk of being discovered. Organizes thrill and taboo.",
          },
          {
            practice: "Public teasing",
            fantasyPull: 3,
            actualPleasure: 3,
            description: "Secret intimacy in public. Organizes anticipation and oneness.",
          },
          {
            practice: "Being watched secretly by partner",
            fantasyPull: 3,
            actualPleasure: 1,
            description: "Being desired without performing. Organizes effortless devotion.",
          },
          {
            practice: "Forced voyeurism fantasy",
            fantasyPull: 5,
            actualPleasure: 2,
            description:
              "Losing control over who sees you. Organizes exposure and energetic polaritylessness.",
          },
          {
            practice: "Cuckold (partner with others)",
            fantasyPull: 4,
            actualPleasure: 3,
            description:
              "Eroticized jealousy and loss of status. Organizes insecurity and surrender.",
          },
          {
            practice: "Hotwifing",
            fantasyPull: 6,
            actualPleasure: 1,
            description:
              "Sharing partner to feel pride and reflected desirability. Organizes status and devotion.",
          },
          {
            practice: "Group sex / threesomes",
            fantasyPull: 2,
            actualPleasure: 1,
            description: "Multiple streams of desire. Organizes sacredness and attention.",
          },
          {
            practice: "Anonymous encounter fantasy",
            fantasyPull: 4,
            actualPleasure: 2,
            description: "Being desired without being known. Organizes freedom from identity.",
          },
        ],
      },
      {
        title: "Fetish, Identity & Body-Focus",
        rows: [
          {
            practice: "Foot fetish",
            fantasyPull: 3,
            actualPleasure: 2,
            description: "Focus on a specific body part. Organizes symbolic attraction.",
          },
          {
            practice: "Hair fetish",
            fantasyPull: 3,
            actualPleasure: 3,
            description: "Arousal from hair. Organizes sensory fixation.",
          },
          {
            practice: "Breasts / nipple play",
            fantasyPull: 5,
            actualPleasure: 6,
            description: "Chest-focused stimulation. Organizes nurturance and pleasure.",
          },
          {
            practice: "Hands / legs / thighs",
            fantasyPull: 5,
            actualPleasure: 7,
            description: "Body-part focus. Organizes visual and tactile attraction.",
          },
          {
            practice: "Voice fetish",
            fantasyPull: 6,
            actualPleasure: 7,
            description: "Arousal from sound. Organizes emotional resonance.",
          },
          {
            practice: "Cross-dressing / gender play",
            fantasyPull: 3,
            actualPleasure: 1,
            description:
              "Wearing or exploring different gendered roles. Organizes identity exploration.",
          },
          {
            practice: "Lingerie / fetish wear",
            fantasyPull: 6,
            actualPleasure: 6,
            description: "Erotic clothing. Organizes display and identity.",
          },
          {
            practice: "Worshipping partner’s body",
            fantasyPull: 6,
            actualPleasure: 8,
            description: "Admiring the partner’s physical form. Organizes devotion.",
          },
        ],
      },
      {
        title: "Taboo, Fluids & Extreme Kink",
        rows: [
          {
            practice: "Cum play",
            fantasyPull: 3,
            actualPleasure: 2,
            description: "Focus on sexual fluids. Organizes taboo and intimacy.",
          },
          {
            practice: "Pee / golden shower",
            fantasyPull: 4,
            actualPleasure: 1,
            description: "Using urine as a taboo element. Organizes transgression.",
          },
          {
            practice: "Scat",
            fantasyPull: 4,
            actualPleasure: 2,
            description: "Using feces as erotic element. Organizes extreme taboo.",
          },
          {
            practice: "Breeding fantasy",
            fantasyPull: 3,
            actualPleasure: 3,
            description: "Imagining impregnation. Organizes fertility and legacy.",
          },
          {
            practice: "Pregnancy play",
            fantasyPull: 3,
            actualPleasure: 1,
            description: "Eroticizing pregnancy. Organizes nurture and taboo.",
          },
          {
            practice: "Lactation play",
            fantasyPull: 2,
            actualPleasure: 2,
            description: "Milk as erotic symbol. Organizes nurturance.",
          },
          {
            practice: "Object insertion",
            fantasyPull: 2,
            actualPleasure: 1,
            description: "Using non-sexual objects. Organizes sacredness and taboo.",
          },
          {
            practice: "Food play",
            fantasyPull: 2,
            actualPleasure: 3,
            description: "Using food in erotic context. Organizes sensory transgression.",
          },
        ],
      },
      {
        title: "Technology & Distance",
        rows: [
          {
            practice: "Sexting",
            fantasyPull: 3,
            actualPleasure: 2,
            description: "Sending erotic messages. Organizes anticipation and desire.",
          },
          {
            practice: "Erotic voice / audio",
            fantasyPull: 5,
            actualPleasure: 6,
            description: "Hearing arousing speech. Organizes intimacy through sound.",
          },
          {
            practice: "Erotic photography / filming",
            fantasyPull: 3,
            actualPleasure: 3,
            description: "Recording intimacy. Organizes being seen and remembered.",
          },
          {
            practice: "Mutual video masturbation",
            fantasyPull: 3,
            actualPleasure: 1,
            description: "Remote shared arousal. Organizes oneness across distance.",
          },
          {
            practice: "Long-distance sexual play",
            fantasyPull: 5,
            actualPleasure: 7,
            description: "Maintaining intimacy when apart. Organizes emotional continuity.",
          },
        ],
      },
      {
        title: "Ritual, Tantra & Conscious Sex",
        rows: [
          {
            practice: "Tantra / spiritual sexuality",
            fantasyPull: 8,
            actualPleasure: 10,
            description: "Presence-based intimacy. Organizes awareness and devotion.",
          },
          {
            practice: "Sacred kink",
            fantasyPull: 8,
            actualPleasure: 9,
            description: "Ritualized erotic power. Organizes sacred connection and transformation.",
          },
          {
            practice: "Sensual rituals",
            fantasyPull: 7,
            actualPleasure: 9,
            description: "Structured, intentional intimacy. Organizes focus and oneness.",
          },
          {
            practice: "Mirror sex",
            fantasyPull: 3,
            actualPleasure: 2,
            description: "Watching oneself and partner. Organizes self-awareness.",
          },
          {
            practice: "Mutual surrender experience",
            fantasyPull: 9,
            actualPleasure: 10,
            description: "Letting go together. Organizes surrender and union.",
          },
          {
            practice: "Shadow work through sex",
            fantasyPull: 8,
            actualPleasure: 8,
            description: "Exploring shame or hidden parts. Organizes integration.",
          },
        ],
      },
    ],
  },
  "Minimalist Companion": {
    introBlocks: [
      "<p>These scores <strong>do not define you as an individual</strong>. They are <strong>probability-based estimates derived from aggregated research and observed patterns across archetypes.</strong></p>",
      "<p>They <strong>reflect what is statistically more common, not what is fixed or deterministic for you individually.</strong> Every person is unique, and real-world preferences are shaped by personal experience, context, development, and the combination of multiple archetypes within you.</p>",
      "<p>This means your actual desires, boundaries, and experiences may align with, differ from, or evolve beyond these patterns — sometimes significantly.</p>",
      "<p>We present two separate metrics on a 10-point scale:</p>",
      "<ul><li><strong>Fantasy Pull:</strong> how strongly a theme tends to appear in imagination, curiosity, or arousal</li><li><strong>Lived Pleasure:</strong> how likely the same theme is to feel grounding, pleasurable, and genuinely good when experienced in real life</li></ul>",
      "<p><strong>Fantasy Pull:</strong></p>",
      "<ul><li><strong>High</strong> (7–10): More likely to feel mentally engaging, arousing, or intriguing in imagination.</li><li><strong>Low</strong> (1–4): Less likely to capture attention or appear in imagination arousing.</li></ul>",
      "<p><strong>Actual Pleasure:</strong></p>",
      "<ul><li><strong>High</strong> (7–10): More likely to feel physically and/or emotionally satisfying in real-life experience (given the right context, such as trust and safety).</li><li><strong>Low</strong> (1–4): Less likely to feel rewarding, pleasurable or to resonate strongly in practice</li></ul>",
      "<p><strong>How to read combinations of scores</strong></p>",
      "<p>Because Fantasy Pull and Lived Pleasure are independent, the relationship between them matters. Looking at both together helps you understand how a theme tends to show up in your mind vs. in real experience.</p>",
      "<p><strong>Low Fantasy + Low Pleasure</strong> → Generally not relevant<br />This suggests a theme is neither mentally engaging nor particularly rewarding in practice. Typically something to deprioritize, unless curiosity emerges naturally over time.</p>",
      "<p><strong>Low Fantasy + High Pleasure</strong> → Better in reality than in imagination</p>",
      "<p>You may not think about it much, but when experienced, it can feel surprisingly good or fulfilling. Often worth gently exploring in real-life contexts, as these areas can reveal unexpected compatibility.</p>",
      "<p><strong>High Fantasy + Low Pleasure</strong> → Stronger in imagination than in reality<br />There is a strong mental or symbolic attraction, but less consistent satisfaction in practice. Calls for conscious exploration and adjustment — refining context, pace, or boundaries — or keeping parts of it in fantasy where it feels most aligned.</p>",
      "<p><strong>High Fantasy + High Pleasure</strong> → Alignment between mind and experience<br />What feels exciting in imagination is also likely to feel good in reality. These are areas to lean into and deepen, often representing natural sources of fulfillment and ease.</p>",
    ],
    groups: [
      {
        title: "Core Relational & Embodied",
        rows: [
          {
            practice: "Romantic lovemaking",
            fantasyPull: 5,
            actualPleasure: 7,
            description:
              "Sex centered on affection, tenderness, and feeling emotionally chosen. Organizes attachment, ease, and steady companionship.",
          },
          {
            practice: "Slow build / extended foreplay",
            fantasyPull: 5,
            actualPleasure: 8,
            description:
              "Gradual arousal through time, touch, and anticipation. Organizes nervous-system regulation and predictability.",
          },
          {
            practice: "Passionate quickies",
            fantasyPull: 3,
            actualPleasure: 3,
            description:
              "Fast, urgent sex driven by impulse. Organizes comfort, release, and simplicity.",
          },
          {
            practice: "Morning sex",
            fantasyPull: 4,
            actualPleasure: 5,
            description:
              "Gentle or energized intimacy after waking. Organizes comfort, connection, and bodily openness.",
          },
          {
            practice: "Sleeping / wake-up sex",
            fantasyPull: 4,
            actualPleasure: 6,
            description:
              "Intimacy while drifting in or out of sleep. Organizes vulnerability and softness.",
          },
          {
            practice: "After-argument / makeup sex",
            fantasyPull: 4,
            actualPleasure: 3,
            description: "Sex after conflict. Organizes emotional repair and tension discharge.",
          },
          {
            practice: "Romantic aftercare",
            fantasyPull: 4,
            actualPleasure: 7,
            description:
              "Cuddling, closeness, and reassurance after sex. Organizes emotional completion and ease.",
          },
          {
            practice: "Emotional vulnerability during sex",
            fantasyPull: 5,
            actualPleasure: 6,
            description:
              "Sharing feelings or being emotionally open while intimate. Organizes being seen and accepted.",
          },
          {
            practice: "Crying or emotional release",
            fantasyPull: 5,
            actualPleasure: 5,
            description:
              "Letting emotions surface during intimacy. Organizes catharsis and relief.",
          },
          {
            practice: "Emotional healing sex",
            fantasyPull: 6,
            actualPleasure: 6,
            description:
              "Using intimacy to soothe or repair emotionally. Organizes nervous-system regulation.",
          },
          {
            practice: "Spiritual merging / oneness",
            fantasyPull: 6,
            actualPleasure: 7,
            description:
              "Experiencing sex as a transcendent union. Organizes meaning and connection beyond self.",
          },
        ],
      },
      {
        title: "Touch, Sensory & Body-Based",
        rows: [
          {
            practice: "Sensual massage",
            fantasyPull: 5,
            actualPleasure: 7,
            description:
              "Slow, attentive touch meant to relax and awaken sensation. Organizes ease and body awareness.",
          },
          {
            practice: "Erotic massage exchange",
            fantasyPull: 5,
            actualPleasure: 8,
            description:
              "Partners take turns giving sensual touch. Organizes mutual giving and receiving.",
          },
          {
            practice: "Sensory play",
            fantasyPull: 5,
            actualPleasure: 4,
            description:
              "Using textures, sounds, or sensations to heighten awareness. Organizes curiosity and bodily focus.",
          },
          {
            practice: "Sensory deprivation / blindfolds",
            fantasyPull: 4,
            actualPleasure: 2,
            description:
              "Limiting senses to intensify others. Organizes surrender and concentration.",
          },
          {
            practice: "Temperature play",
            fantasyPull: 4,
            actualPleasure: 3,
            description:
              "Using warmth or coolness to stimulate nerves. Organizes simplicity and alertness.",
          },
          {
            practice: "Slow synchronized breathing",
            fantasyPull: 5,
            actualPleasure: 6,
            description: "Breathing together. Organizes co-regulation and calm.",
          },
          {
            practice: "Mutual tantric gaze",
            fantasyPull: 4,
            actualPleasure: 7,
            description: "Holding eye contact for extended time. Organizes emotional presence.",
          },
          {
            practice: "Scent / pheromone play",
            fantasyPull: 4,
            actualPleasure: 5,
            description: "Using smell as an arousal cue. Organizes primal attraction.",
          },
          {
            practice: "Multi-sensory immersion",
            fantasyPull: 6,
            actualPleasure: 7,
            description:
              "Combining sound, touch, smell, and atmosphere. Organizes full-body engagement.",
          },
        ],
      },
      {
        title: "Giving vs Receiving Stimulation",
        rows: [
          {
            practice: "Giving oral",
            fantasyPull: 4,
            actualPleasure: 5,
            description: "Pleasing a partner with a mouth. Organizes caretaking and attentiveness.",
          },
          {
            practice: "Receiving oral",
            fantasyPull: 4,
            actualPleasure: 4,
            description:
              "Being pleasured by a partner’s mouth. Organizes feeling wanted and focused on.",
          },
          {
            practice: "Giving manual stimulation",
            fantasyPull: 4,
            actualPleasure: 6,
            description: "Pleasing a partner with hands. Organizes giving and responsiveness.",
          },
          {
            practice: "Receiving manual stimulation",
            fantasyPull: 4,
            actualPleasure: 3,
            description: "Being pleasured by touch. Organizes being held in erotic attention.",
          },
          {
            practice: "Mutual masturbation",
            fantasyPull: 3,
            actualPleasure: 2,
            description:
              "Both partners pleasure themselves together. Organizes shared presence with autonomy.",
          },
          {
            practice: "Masturbating in front of partner",
            fantasyPull: 3,
            actualPleasure: 1,
            description:
              "Self-pleasure while being watched. Organizes being desired without effort.",
          },
          {
            practice: "Using toys on partner",
            fantasyPull: 3,
            actualPleasure: 3,
            description: "Enhancing their sensation. Organizes caretaking and curiosity.",
          },
          {
            practice: "Having toys used on you",
            fantasyPull: 4,
            actualPleasure: 2,
            description: "Receiving intensified stimulation. Organizes surrender and focus.",
          },
        ],
      },
      {
        title: "Penetration & Body Opening",
        rows: [
          {
            practice: "Penetrating partner",
            fantasyPull: 2,
            actualPleasure: 2,
            description: "Being the active, initiating body. Organizes agency and movement.",
          },
          {
            practice: "Being penetrated",
            fantasyPull: 2,
            actualPleasure: 3,
            description:
              "Allowing the partner inside one’s body. Organizes surrender and openness.",
          },
          {
            practice: "Pegging",
            fantasyPull: 4,
            actualPleasure: 1,
            description:
              "Being penetrated by a partner using a device. Organizes role-reversal and predictability.",
          },
          {
            practice: "Anal play (giving)",
            fantasyPull: 4,
            actualPleasure: 2,
            description: "Stimulating a partner anally. Organizes control and taboo.",
          },
          {
            practice: "Anal play (receiving)",
            fantasyPull: 3,
            actualPleasure: 1,
            description: "Being anally stimulated. Organizes vulnerability and surrender.",
          },
          {
            practice: "Double-penetration fantasy",
            fantasyPull: 5,
            actualPleasure: 1,
            description:
              "Imagining intense bodily overwhelm. Organizes extremity and fantasy of being overtaken.",
          },
        ],
      },
      {
        title: "Power & Role Dynamics",
        rows: [
          {
            practice: "Dominating",
            fantasyPull: 3,
            actualPleasure: 1,
            description: "Taking charge and directing the encounter. Organizes agency and control.",
          },
          {
            practice: "Submitting",
            fantasyPull: 5,
            actualPleasure: 3,
            description:
              "Letting the partner lead. Organizes predictability and release of responsibility.",
          },
          {
            practice: "Romantic dominance",
            fantasyPull: 5,
            actualPleasure: 4,
            description: "Leading in a caring, protective way. Organizes ease and attraction.",
          },
          {
            practice: "Service submission",
            fantasyPull: 5,
            actualPleasure: 2,
            description:
              "Showing devotion by pleasing the partner. Organizes caretaking and meaning.",
          },
          {
            practice: "Worshipping partner",
            fantasyPull: 5,
            actualPleasure: 5,
            description:
              "Treating the partner as precious or ideal. Organizes devotion and admiration.",
          },
          {
            practice: "Being worshipped",
            fantasyPull: 4,
            actualPleasure: 4,
            description: "Being idealized and adored. Organizes acceptance and self-worth.",
          },
          {
            practice: "Master–slave (consensual)",
            fantasyPull: 5,
            actualPleasure: 1,
            description: "Formalized hierarchy. Organizes identity and power structure.",
          },
          {
            practice: "Power exchange (24/7 or partial)",
            fantasyPull: 6,
            actualPleasure: 1,
            description: "Maintaining roles inside and outside sex. Organizes lifestyle identity.",
          },
        ],
      },
      {
        title: "Pain, Restraint & Edge",
        rows: [
          {
            practice: "Giving impact (spanking, etc.)",
            fantasyPull: 4,
            actualPleasure: 1,
            description: "Applying controlled physical sensation. Organizes expression of power.",
          },
          {
            practice: "Receiving impact",
            fantasyPull: 4,
            actualPleasure: 2,
            description: "Experiencing strong sensation. Organizes surrender and ease.",
          },
          {
            practice: "Biting / scratching",
            fantasyPull: 3,
            actualPleasure: 2,
            description: "Primal physical expression. Organizes animalistic energy.",
          },
          {
            practice: "Choking / neck holding (light, consensual)",
            fantasyPull: 5,
            actualPleasure: 1,
            description:
              "Heightened intensity through trust and risk. Organizes surrender and thrill.",
          },
          {
            practice: "Restraining partner",
            fantasyPull: 3,
            actualPleasure: 1,
            description: "Limiting movement. Organizes control and dominance.",
          },
          {
            practice: "Being restrained",
            fantasyPull: 5,
            actualPleasure: 2,
            description: "Having movement limited. Organizes surrender and focus.",
          },
          {
            practice: "Erotic pain endurance",
            fantasyPull: 6,
            actualPleasure: 1,
            description: "Holding a strong sensation. Organizes challenge and resilience.",
          },
          {
            practice: "Shibari / erotic rope art",
            fantasyPull: 4,
            actualPleasure: 3,
            description: "Aesthetic and emotional restraint. Organizes beauty and surrender.",
          },
        ],
      },
      {
        title: "Erotic Attention, Voyeurism & Third-Party Themes",
        rows: [
          {
            practice: "Being watched by partner",
            fantasyPull: 5,
            actualPleasure: 3,
            description: "Being held in a partner’s desire. Organizes acceptance and being chosen.",
          },
          {
            practice: "Watching your partner",
            fantasyPull: 5,
            actualPleasure: 5,
            description: "Witnessing their arousal. Organizes empathy and connection.",
          },
          {
            practice: "Voyeurism (watching others)",
            fantasyPull: 4,
            actualPleasure: 2,
            description: "Observing from emotional distance. Organizes curiosity and fantasy.",
          },
          {
            practice: "Exhibitionism",
            fantasyPull: 5,
            actualPleasure: 1,
            description: "Being visible to others. Organizes acceptance and performance.",
          },
          {
            practice: "Public or semi-public play",
            fantasyPull: 5,
            actualPleasure: 2,
            description: "Risk of being discovered. Organizes thrill and taboo.",
          },
          {
            practice: "Public teasing",
            fantasyPull: 4,
            actualPleasure: 1,
            description:
              "Secret intimacy in public. Organizes anticipation and steady companionship.",
          },
          {
            practice: "Being watched secretly by partner",
            fantasyPull: 3,
            actualPleasure: 1,
            description: "Being desired without performing. Organizes effortless acceptance.",
          },
          {
            practice: "Forced voyeurism fantasy",
            fantasyPull: 6,
            actualPleasure: 1,
            description: "Losing control over who sees you. Organizes exposure and powerlessness.",
          },
          {
            practice: "Cuckold (partner with others)",
            fantasyPull: 6,
            actualPleasure: 2,
            description:
              "Eroticized jealousy and loss of status. Organizes insecurity and surrender.",
          },
          {
            practice: "Hotwifing",
            fantasyPull: 7,
            actualPleasure: 1,
            description:
              "Sharing partner to feel pride and reflected desirability. Organizes status and acceptance.",
          },
          {
            practice: "Group sex / threesomes",
            fantasyPull: 3,
            actualPleasure: 3,
            description: "Multiple streams of desire. Organizes simplicity and attention.",
          },
          {
            practice: "Anonymous encounter fantasy",
            fantasyPull: 7,
            actualPleasure: 3,
            description: "Being desired without being known. Organizes freedom from identity.",
          },
        ],
      },
      {
        title: "Fetish, Identity & Body-Focus",
        rows: [
          {
            practice: "Foot fetish",
            fantasyPull: 4,
            actualPleasure: 1,
            description: "Focus on a specific body part. Organizes symbolic attraction.",
          },
          {
            practice: "Hair fetish",
            fantasyPull: 3,
            actualPleasure: 2,
            description: "Arousal from hair. Organizes sensory fixation.",
          },
          {
            practice: "Breasts / nipple play",
            fantasyPull: 4,
            actualPleasure: 4,
            description: "Chest-focused stimulation. Organizes nurturance and pleasure.",
          },
          {
            practice: "Hands / legs / thighs",
            fantasyPull: 4,
            actualPleasure: 5,
            description: "Body-part focus. Organizes visual and tactile attraction.",
          },
          {
            practice: "Voice fetish",
            fantasyPull: 4,
            actualPleasure: 6,
            description: "Arousal from sound. Organizes emotional resonance.",
          },
          {
            practice: "Cross-dressing / gender play",
            fantasyPull: 4,
            actualPleasure: 2,
            description:
              "Wearing or exploring different gendered roles. Organizes identity exploration.",
          },
          {
            practice: "Lingerie / fetish wear",
            fantasyPull: 5,
            actualPleasure: 4,
            description: "Erotic clothing. Organizes display and identity.",
          },
          {
            practice: "Worshipping partner’s body",
            fantasyPull: 5,
            actualPleasure: 5,
            description: "Admiring the partner’s physical form. Organizes devotion.",
          },
        ],
      },
      {
        title: "Taboo, Fluids & Extreme Kink",
        rows: [
          {
            practice: "Cum play",
            fantasyPull: 4,
            actualPleasure: 1,
            description: "Focus on sexual fluids. Organizes taboo and intimacy.",
          },
          {
            practice: "Pee / golden shower",
            fantasyPull: 5,
            actualPleasure: 1,
            description: "Using urine as a taboo element. Organizes transgression.",
          },
          {
            practice: "Scat",
            fantasyPull: 5,
            actualPleasure: 2,
            description: "Using feces as erotic element. Organizes extreme taboo.",
          },
          {
            practice: "Breeding fantasy",
            fantasyPull: 4,
            actualPleasure: 2,
            description: "Imagining impregnation. Organizes fertility and legacy.",
          },
          {
            practice: "Pregnancy play",
            fantasyPull: 3,
            actualPleasure: 1,
            description: "Eroticizing pregnancy. Organizes nurture and taboo.",
          },
          {
            practice: "Lactation play",
            fantasyPull: 4,
            actualPleasure: 3,
            description: "Milk as erotic symbol. Organizes nurturance.",
          },
          {
            practice: "Object insertion",
            fantasyPull: 6,
            actualPleasure: 1,
            description: "Using non-sexual objects. Organizes simplicity and taboo.",
          },
          {
            practice: "Food play",
            fantasyPull: 3,
            actualPleasure: 2,
            description: "Using food in erotic context. Organizes sensory transgression.",
          },
        ],
      },
      {
        title: "Technology & Distance",
        rows: [
          {
            practice: "Sexting",
            fantasyPull: 3,
            actualPleasure: 2,
            description: "Sending erotic messages. Organizes anticipation and desire.",
          },
          {
            practice: "Erotic voice / audio",
            fantasyPull: 4,
            actualPleasure: 4,
            description: "Hearing arousing speech. Organizes intimacy through sound.",
          },
          {
            practice: "Erotic photography / filming",
            fantasyPull: 4,
            actualPleasure: 1,
            description: "Recording intimacy. Organizes being seen and remembered.",
          },
          {
            practice: "Mutual video masturbation",
            fantasyPull: 3,
            actualPleasure: 1,
            description: "Remote shared arousal. Organizes connection across distance.",
          },
          {
            practice: "Long-distance sexual play",
            fantasyPull: 4,
            actualPleasure: 5,
            description: "Maintaining intimacy when apart. Organizes emotional continuity.",
          },
        ],
      },
      {
        title: "Ritual, Tantra & Conscious Sex",
        rows: [
          {
            practice: "Tantra / spiritual sexuality",
            fantasyPull: 6,
            actualPleasure: 7,
            description: "Presence-based intimacy. Organizes awareness and depth.",
          },
          {
            practice: "Sacred kink",
            fantasyPull: 6,
            actualPleasure: 5,
            description: "Ritualized erotic power. Organizes meaning and transformation.",
          },
          {
            practice: "Sensual rituals",
            fantasyPull: 5,
            actualPleasure: 7,
            description: "Structured, intentional intimacy. Organizes focus and connection.",
          },
          {
            practice: "Mirror sex",
            fantasyPull: 3,
            actualPleasure: 1,
            description: "Watching oneself and partner. Organizes self-awareness.",
          },
          {
            practice: "Mutual surrender experience",
            fantasyPull: 6,
            actualPleasure: 6,
            description: "Letting go together. Organizes predictability and union.",
          },
          {
            practice: "Shadow work through sex",
            fantasyPull: 6,
            actualPleasure: 4,
            description: "Exploring shame or hidden parts. Organizes integration.",
          },
        ],
      },
    ],
  },
  "Emotional Voyeur": {
    introBlocks: [
      "<p>These scores <strong>do not define you as an individual</strong>. They are <strong>probability-based estimates derived from aggregated research and observed patterns across archetypes.</strong></p>",
      "<p>They <strong>reflect what is statistically more common, not what is fixed or deterministic for you individually.</strong> Every person is unique, and real-world preferences are shaped by personal experience, context, development, and the combination of multiple archetypes within you.</p>",
      "<p>This means your actual desires, boundaries, and experiences may align with, differ from, or evolve beyond these patterns — sometimes significantly.</p>",
      "<p>We present two separate metrics on a 10-point scale:</p>",
      "<ul><li><strong>Fantasy Pull:</strong> how strongly a theme tends to appear in imagination, curiosity, or arousal</li><li><strong>Lived Pleasure:</strong> how likely the same theme is to feel grounding, pleasurable, and genuinely good when experienced in real life</li></ul>",
      "<p><strong>Fantasy Pull:</strong></p>",
      "<ul><li><strong>High</strong> (7–10): More likely to feel mentally engaging, arousing, or intriguing in imagination.</li><li><strong>Low</strong> (1–4): Less likely to capture attention or appear in imagination arousing.</li></ul>",
      "<p><strong>Actual Pleasure:</strong></p>",
      "<ul><li><strong>High</strong> (7–10): More likely to feel physically and/or emotionally satisfying in real-life experience (given the right context, such as trust and safety).</li><li><strong>Low</strong> (1–4): Less likely to feel rewarding, pleasurable or to resonate strongly in practice</li></ul>",
      "<p><strong>How to read combinations of scores</strong></p>",
      "<p>Because Fantasy Pull and Lived Pleasure are independent, the relationship between them matters. Looking at both together helps you understand how a theme tends to show up in your mind vs. in real experience.</p>",
      "<p><strong>Low Fantasy + Low Pleasure</strong> → Generally not relevant<br />This suggests a theme is neither mentally engaging nor particularly rewarding in practice. Typically something to deprioritize, unless curiosity emerges naturally over time.</p>",
      "<p><strong>Low Fantasy + High Pleasure</strong> → Better in reality than in imagination</p>",
      "<p>You may not think about it much, but when experienced, it can feel surprisingly good or fulfilling. Often worth gently exploring in real-life contexts, as these areas can reveal unexpected compatibility.</p>",
      "<p><strong>High Fantasy + Low Pleasure</strong> → Stronger in imagination than in reality<br />There is a strong mental or symbolic attraction, but less consistent satisfaction in practice. Calls for conscious exploration and adjustment — refining context, pace, or boundaries — or keeping parts of it in fantasy where it feels most aligned.</p>",
      "<p><strong>High Fantasy + High Pleasure</strong> → Alignment between mind and experience<br />What feels exciting in imagination is also likely to feel good in reality. These are areas to lean into and deepen, often representing natural sources of fulfillment and ease.</p>",
    ],
    groups: [
      {
        title: "Core Relational & Embodied",
        rows: [
          {
            practice: "Romantic lovemaking",
            fantasyPull: 5,
            actualPleasure: 7,
            description:
              "Sex centered on affection, tenderness, and feeling emotionally chosen. Organizes attachment, privacy, and atmosphere and connection.",
          },
          {
            practice: "Slow build / extended foreplay",
            fantasyPull: 5,
            actualPleasure: 8,
            description:
              "Gradual arousal through time, touch, and anticipation. Organizes nervous-system regulation and discretion.",
          },
          {
            practice: "Passionate quickies",
            fantasyPull: 3,
            actualPleasure: 3,
            description:
              "Fast, urgent sex driven by impulse. Organizes excitement, release, and novelty.",
          },
          {
            practice: "Morning sex",
            fantasyPull: 4,
            actualPleasure: 5,
            description:
              "Gentle or energized intimacy after waking. Organizes comfort, connection, and bodily openness.",
          },
          {
            practice: "Sleeping / wake-up sex",
            fantasyPull: 5,
            actualPleasure: 5,
            description:
              "Intimacy while drifting in or out of sleep. Organizes controlled exposure and softness.",
          },
          {
            practice: "After-argument / makeup sex",
            fantasyPull: 5,
            actualPleasure: 2,
            description: "Sex after conflict. Organizes emotional repair and tension discharge.",
          },
          {
            practice: "Romantic aftercare",
            fantasyPull: 5,
            actualPleasure: 6,
            description:
              "Cuddling, closeness, and reassurance after sex. Organizes emotional completion and privacy.",
          },
          {
            practice: "Emotional vulnerability during sex",
            fantasyPull: 5,
            actualPleasure: 4,
            description:
              "Sharing feelings or being emotionally open while intimate. Organizes witnessing and accepted.",
          },
          {
            practice: "Crying or emotional release",
            fantasyPull: 5,
            actualPleasure: 3,
            description:
              "Letting emotions surface during intimacy. Organizes catharsis and relief.",
          },
          {
            practice: "Emotional healing sex",
            fantasyPull: 6,
            actualPleasure: 4,
            description:
              "Using intimacy to soothe or repair emotionally. Organizes nervous-system regulation.",
          },
          {
            practice: "Spiritual merging / oneness",
            fantasyPull: 6,
            actualPleasure: 6,
            description:
              "Experiencing sex as a transcendent union. Organizes meaning and connection beyond self.",
          },
        ],
      },
      {
        title: "Touch, Sensory & Body-Based",
        rows: [
          {
            practice: "Sensual massage",
            fantasyPull: 5,
            actualPleasure: 7,
            description:
              "Slow, attentive touch meant to relax and awaken sensation. Organizes privacy and body awareness.",
          },
          {
            practice: "Erotic massage exchange",
            fantasyPull: 5,
            actualPleasure: 8,
            description:
              "Partners take turns giving sensual touch. Organizes mutual giving and receiving.",
          },
          {
            practice: "Sensory play",
            fantasyPull: 5,
            actualPleasure: 5,
            description:
              "Using textures, sounds, or sensations to heighten awareness. Organizes curiosity and bodily focus.",
          },
          {
            practice: "Sensory deprivation / blindfolds",
            fantasyPull: 5,
            actualPleasure: 1,
            description:
              "Limiting senses to intensify others. Organizes surrender and concentration.",
          },
          {
            practice: "Temperature play",
            fantasyPull: 5,
            actualPleasure: 4,
            description:
              "Using warmth or coolness to stimulate nerves. Organizes novelty and alertness.",
          },
          {
            practice: "Slow synchronized breathing",
            fantasyPull: 5,
            actualPleasure: 6,
            description: "Breathing together. Organizes co-regulation and calm.",
          },
          {
            practice: "Mutual tantric gaze",
            fantasyPull: 4,
            actualPleasure: 7,
            description: "Holding eye contact for extended time. Organizes emotional presence.",
          },
          {
            practice: "Scent / pheromone play",
            fantasyPull: 6,
            actualPleasure: 5,
            description: "Using smell as an arousal cue. Organizes primal attraction.",
          },
          {
            practice: "Multi-sensory immersion",
            fantasyPull: 6,
            actualPleasure: 7,
            description:
              "Combining sound, touch, smell, and atmosphere. Organizes full-body engagement.",
          },
        ],
      },
      {
        title: "Giving vs Receiving Stimulation",
        rows: [
          {
            practice: "Giving oral",
            fantasyPull: 4,
            actualPleasure: 5,
            description: "Pleasing a partner with a mouth. Organizes caretaking and attentiveness.",
          },
          {
            practice: "Receiving oral",
            fantasyPull: 4,
            actualPleasure: 4,
            description:
              "Being pleasured by a partner’s mouth. Organizes feeling wanted and focused on.",
          },
          {
            practice: "Giving manual stimulation",
            fantasyPull: 4,
            actualPleasure: 6,
            description: "Pleasing a partner with hands. Organizes giving and responsiveness.",
          },
          {
            practice: "Receiving manual stimulation",
            fantasyPull: 4,
            actualPleasure: 3,
            description: "Being pleasured by touch. Organizes being held in erotic attention.",
          },
          {
            practice: "Mutual masturbation",
            fantasyPull: 3,
            actualPleasure: 2,
            description:
              "Both partners pleasure themselves together. Organizes shared presence with autonomy.",
          },
          {
            practice: "Masturbating in front of partner",
            fantasyPull: 4,
            actualPleasure: 1,
            description:
              "Self-pleasure while being watched. Organizes being desired without effort.",
          },
          {
            practice: "Using toys on partner",
            fantasyPull: 3,
            actualPleasure: 3,
            description: "Enhancing their sensation. Organizes caretaking and curiosity.",
          },
          {
            practice: "Having toys used on you",
            fantasyPull: 3,
            actualPleasure: 1,
            description: "Receiving intensified stimulation. Organizes surrender and focus.",
          },
        ],
      },
      {
        title: "Penetration & Body Opening",
        rows: [
          {
            practice: "Penetrating partner",
            fantasyPull: 2,
            actualPleasure: 2,
            description: "Being the active, initiating body. Organizes agency and movement.",
          },
          {
            practice: "Being penetrated",
            fantasyPull: 2,
            actualPleasure: 3,
            description:
              "Allowing the partner inside one’s body. Organizes surrender and openness.",
          },
          {
            practice: "Pegging",
            fantasyPull: 5,
            actualPleasure: 2,
            description:
              "Being penetrated by a partner using a device. Organizes role-reversal and discretion.",
          },
          {
            practice: "Anal play (giving)",
            fantasyPull: 5,
            actualPleasure: 3,
            description: "Stimulating a partner anally. Organizes control and taboo.",
          },
          {
            practice: "Anal play (receiving)",
            fantasyPull: 5,
            actualPleasure: 1,
            description: "Being anally stimulated. Organizes controlled exposure and surrender.",
          },
          {
            practice: "Double-penetration fantasy",
            fantasyPull: 7,
            actualPleasure: 3,
            description:
              "Imagining intense bodily overwhelm. Organizes extremity and fantasy of being overtaken.",
          },
        ],
      },
      {
        title: "Power & Role Dynamics",
        rows: [
          {
            practice: "Dominating",
            fantasyPull: 4,
            actualPleasure: 2,
            description: "Taking charge and directing the encounter. Organizes agency and control.",
          },
          {
            practice: "Submitting",
            fantasyPull: 5,
            actualPleasure: 2,
            description:
              "Letting the partner lead. Organizes discretion and release of responsibility.",
          },
          {
            practice: "Romantic dominance",
            fantasyPull: 5,
            actualPleasure: 4,
            description: "Leading in a caring, protective way. Organizes privacy and attraction.",
          },
          {
            practice: "Service submission",
            fantasyPull: 5,
            actualPleasure: 3,
            description:
              "Showing devotion by pleasing the partner. Organizes caretaking and meaning.",
          },
          {
            practice: "Worshipping partner",
            fantasyPull: 5,
            actualPleasure: 5,
            description:
              "Treating the partner as precious or ideal. Organizes devotion and admiration.",
          },
          {
            practice: "Being worshipped",
            fantasyPull: 6,
            actualPleasure: 4,
            description:
              "Being idealized and adored. Organizes being desired from a distance and self-worth.",
          },
          {
            practice: "Master–slave (consensual)",
            fantasyPull: 7,
            actualPleasure: 1,
            description: "Formalized hierarchy. Organizes identity and selective access structure.",
          },
          {
            practice: "Power exchange (24/7 or partial)",
            fantasyPull: 7,
            actualPleasure: 2,
            description: "Maintaining roles inside and outside sex. Organizes lifestyle identity.",
          },
        ],
      },
      {
        title: "Pain, Restraint & Edge",
        rows: [
          {
            practice: "Giving impact (spanking, etc.)",
            fantasyPull: 5,
            actualPleasure: 2,
            description:
              "Applying controlled physical sensation. Organizes expression of selective access.",
          },
          {
            practice: "Receiving impact",
            fantasyPull: 5,
            actualPleasure: 1,
            description: "Experiencing strong sensation. Organizes surrender and intensity.",
          },
          {
            practice: "Biting / scratching",
            fantasyPull: 4,
            actualPleasure: 2,
            description: "Primal physical expression. Organizes animalistic energy.",
          },
          {
            practice: "Choking / neck holding (light, consensual)",
            fantasyPull: 7,
            actualPleasure: 1,
            description:
              "Heightened intensity through trust and risk. Organizes surrender and thrill.",
          },
          {
            practice: "Restraining partner",
            fantasyPull: 6,
            actualPleasure: 1,
            description: "Limiting movement. Organizes control and dominance.",
          },
          {
            practice: "Being restrained",
            fantasyPull: 4,
            actualPleasure: 1,
            description: "Having movement limited. Organizes surrender and focus.",
          },
          {
            practice: "Erotic pain endurance",
            fantasyPull: 7,
            actualPleasure: 2,
            description: "Holding a strong sensation. Organizes challenge and resilience.",
          },
          {
            practice: "Shibari / erotic rope art",
            fantasyPull: 6,
            actualPleasure: 2,
            description: "Aesthetic and emotional restraint. Organizes beauty and surrender.",
          },
        ],
      },
      {
        title: "Erotic Attention, Voyeurism & Third-Party Themes",
        rows: [
          {
            practice: "Being watched by partner",
            fantasyPull: 5,
            actualPleasure: 3,
            description:
              "Being held in a partner’s desire. Organizes being desired from a distance and being chosen.",
          },
          {
            practice: "Watching your partner",
            fantasyPull: 5,
            actualPleasure: 5,
            description: "Witnessing their arousal. Organizes empathy and connection.",
          },
          {
            practice: "Voyeurism (watching others)",
            fantasyPull: 5,
            actualPleasure: 4,
            description: "Observing from emotional distance. Organizes curiosity and fantasy.",
          },
          {
            practice: "Exhibitionism",
            fantasyPull: 7,
            actualPleasure: 2,
            description:
              "Being visible to others. Organizes being desired from a distance and performance.",
          },
          {
            practice: "Public or semi-public play",
            fantasyPull: 7,
            actualPleasure: 1,
            description: "Risk of being discovered. Organizes thrill and taboo.",
          },
          {
            practice: "Public teasing",
            fantasyPull: 5,
            actualPleasure: 2,
            description:
              "Secret intimacy in public. Organizes anticipation and atmosphere and connection.",
          },
          {
            practice: "Being watched secretly by partner",
            fantasyPull: 5,
            actualPleasure: 1,
            description:
              "Being desired without performing. Organizes effortless being desired from a distance.",
          },
          {
            practice: "Forced voyeurism fantasy",
            fantasyPull: 8,
            actualPleasure: 2,
            description:
              "Losing control over who sees you. Organizes exposure and selective accesslessness.",
          },
          {
            practice: "Cuckold (partner with others)",
            fantasyPull: 6,
            actualPleasure: 2,
            description:
              "Eroticized jealousy and loss of status. Organizes insecurity and surrender.",
          },
          {
            practice: "Hotwifing",
            fantasyPull: 6,
            actualPleasure: 1,
            description:
              "Sharing partner to feel pride and reflected desirability. Organizes status and being desired from a distance.",
          },
          {
            practice: "Group sex / threesomes",
            fantasyPull: 8,
            actualPleasure: 1,
            description: "Multiple streams of desire. Organizes novelty and attention.",
          },
          {
            practice: "Anonymous encounter fantasy",
            fantasyPull: 7,
            actualPleasure: 3,
            description: "Being desired without being known. Organizes freedom from identity.",
          },
        ],
      },
      {
        title: "Fetish, Identity & Body-Focus",
        rows: [
          {
            practice: "Foot fetish",
            fantasyPull: 5,
            actualPleasure: 2,
            description: "Focus on a specific body part. Organizes symbolic attraction.",
          },
          {
            practice: "Hair fetish",
            fantasyPull: 3,
            actualPleasure: 2,
            description: "Arousal from hair. Organizes sensory fixation.",
          },
          {
            practice: "Breasts / nipple play",
            fantasyPull: 4,
            actualPleasure: 4,
            description: "Chest-focused stimulation. Organizes nurturance and pleasure.",
          },
          {
            practice: "Hands / legs / thighs",
            fantasyPull: 4,
            actualPleasure: 5,
            description: "Body-part focus. Organizes visual and tactile attraction.",
          },
          {
            practice: "Voice fetish",
            fantasyPull: 5,
            actualPleasure: 5,
            description: "Arousal from sound. Organizes emotional resonance.",
          },
          {
            practice: "Cross-dressing / gender play",
            fantasyPull: 5,
            actualPleasure: 1,
            description:
              "Wearing or exploring different gendered roles. Organizes identity exploration.",
          },
          {
            practice: "Lingerie / fetish wear",
            fantasyPull: 5,
            actualPleasure: 4,
            description: "Erotic clothing. Organizes display and identity.",
          },
          {
            practice: "Worshipping partner’s body",
            fantasyPull: 5,
            actualPleasure: 6,
            description: "Admiring the partner’s physical form. Organizes devotion.",
          },
        ],
      },
      {
        title: "Taboo, Fluids & Extreme Kink",
        rows: [
          {
            practice: "Cum play",
            fantasyPull: 5,
            actualPleasure: 2,
            description: "Focus on sexual fluids. Organizes taboo and intimacy.",
          },
          {
            practice: "Pee / golden shower",
            fantasyPull: 7,
            actualPleasure: 2,
            description: "Using urine as a taboo element. Organizes transgression.",
          },
          {
            practice: "Scat",
            fantasyPull: 7,
            actualPleasure: 3,
            description: "Using feces as erotic element. Organizes extreme taboo.",
          },
          {
            practice: "Breeding fantasy",
            fantasyPull: 5,
            actualPleasure: 3,
            description: "Imagining impregnation. Organizes fertility and legacy.",
          },
          {
            practice: "Pregnancy play",
            fantasyPull: 5,
            actualPleasure: 1,
            description: "Eroticizing pregnancy. Organizes nurture and taboo.",
          },
          {
            practice: "Lactation play",
            fantasyPull: 6,
            actualPleasure: 2,
            description: "Milk as erotic symbol. Organizes nurturance.",
          },
          {
            practice: "Object insertion",
            fantasyPull: 4,
            actualPleasure: 1,
            description: "Using non-sexual objects. Organizes novelty and taboo.",
          },
          {
            practice: "Food play",
            fantasyPull: 4,
            actualPleasure: 2,
            description: "Using food in erotic context. Organizes sensory transgression.",
          },
        ],
      },
      {
        title: "Technology & Distance",
        rows: [
          {
            practice: "Sexting",
            fantasyPull: 4,
            actualPleasure: 2,
            description: "Sending erotic messages. Organizes anticipation and desire.",
          },
          {
            practice: "Erotic voice / audio",
            fantasyPull: 4,
            actualPleasure: 4,
            description: "Hearing arousing speech. Organizes intimacy through sound.",
          },
          {
            practice: "Erotic photography / filming",
            fantasyPull: 5,
            actualPleasure: 1,
            description: "Recording intimacy. Organizes witnessing and remembered.",
          },
          {
            practice: "Mutual video masturbation",
            fantasyPull: 4,
            actualPleasure: 1,
            description: "Remote shared arousal. Organizes connection across distance.",
          },
          {
            practice: "Long-distance sexual play",
            fantasyPull: 4,
            actualPleasure: 5,
            description: "Maintaining intimacy when apart. Organizes emotional continuity.",
          },
        ],
      },
      {
        title: "Ritual, Tantra & Conscious Sex",
        rows: [
          {
            practice: "Tantra / spiritual sexuality",
            fantasyPull: 6,
            actualPleasure: 7,
            description: "Presence-based intimacy. Organizes awareness and depth.",
          },
          {
            practice: "Sacred kink",
            fantasyPull: 7,
            actualPleasure: 4,
            description: "Ritualized erotic power. Organizes meaning and transformation.",
          },
          {
            practice: "Sensual rituals",
            fantasyPull: 5,
            actualPleasure: 7,
            description: "Structured, intentional intimacy. Organizes focus and connection.",
          },
          {
            practice: "Mirror sex",
            fantasyPull: 4,
            actualPleasure: 1,
            description: "Watching oneself and partner. Organizes self-awareness.",
          },
          {
            practice: "Mutual surrender experience",
            fantasyPull: 6,
            actualPleasure: 5,
            description: "Letting go together. Organizes discretion and union.",
          },
          {
            practice: "Shadow work through sex",
            fantasyPull: 7,
            actualPleasure: 2,
            description: "Exploring shame or hidden parts. Organizes integration.",
          },
        ],
      },
    ],
  },
  "Authority Conductor": {
    introBlocks: [
      "<p>These scores <strong>do not define you as an individual</strong>. They are <strong>probability-based estimates derived from aggregated research and observed patterns across archetypes.</strong></p>",
      "<p>They <strong>reflect what is statistically more common, not what is fixed or deterministic for you individually.</strong> Every person is unique, and real-world preferences are shaped by personal experience, context, development, and the combination of multiple archetypes within you.</p>",
      "<p>This means your actual desires, boundaries, and experiences may align with, differ from, or evolve beyond these patterns — sometimes significantly.</p>",
      "<p>We present two separate metrics on a 10-point scale:</p>",
      "<ul><li><strong>Fantasy Pull:</strong> how strongly a theme tends to appear in imagination, curiosity, or arousal</li><li><strong>Lived Pleasure:</strong> how likely the same theme is to feel grounding, pleasurable, and genuinely good when experienced in real life</li></ul>",
      "<p><strong>Fantasy Pull:</strong></p>",
      "<ul><li><strong>High</strong> (7–10): More likely to feel mentally engaging, arousing, or intriguing in imagination.</li><li><strong>Low</strong> (1–4): Less likely to capture attention or appear in imagination arousing.</li></ul>",
      "<p><strong>Actual Pleasure:</strong></p>",
      "<ul><li><strong>High</strong> (7–10): More likely to feel physically and/or emotionally satisfying in real-life experience (given the right context, such as trust and safety).</li><li><strong>Low</strong> (1–4): Less likely to feel rewarding, pleasurable or to resonate strongly in practice</li></ul>",
      "<p><strong>How to read combinations of scores</strong></p>",
      "<p>Because Fantasy Pull and Lived Pleasure are independent, the relationship between them matters. Looking at both together helps you understand how a theme tends to show up in your mind vs. in real experience.</p>",
      "<p><strong>Low Fantasy + Low Pleasure</strong> → Generally not relevant<br />This suggests a theme is neither mentally engaging nor particularly rewarding in practice. Typically something to deprioritize, unless curiosity emerges naturally over time.</p>",
      "<p><strong>Low Fantasy + High Pleasure</strong> → Better in reality than in imagination</p>",
      "<p>You may not think about it much, but when experienced, it can feel surprisingly good or fulfilling. Often worth gently exploring in real-life contexts, as these areas can reveal unexpected compatibility.</p>",
      "<p><strong>High Fantasy + Low Pleasure</strong> → Stronger in imagination than in reality<br />There is a strong mental or symbolic attraction, but less consistent satisfaction in practice. Calls for conscious exploration and adjustment — refining context, pace, or boundaries — or keeping parts of it in fantasy where it feels most aligned.</p>",
      "<p><strong>High Fantasy + High Pleasure</strong> → Alignment between mind and experience<br />What feels exciting in imagination is also likely to feel good in reality. These are areas to lean into and deepen, often representing natural sources of fulfillment and ease.</p>",
    ],
    groups: [
      {
        title: "Core Relational & Embodied",
        rows: [
          {
            practice: "Romantic lovemaking",
            fantasyPull: 3,
            actualPleasure: 3,
            description:
              "Sex centered on affection, tenderness, and feeling emotionally chosen. Organizes attachment, control and consent, and loyalty.",
          },
          {
            practice: "Slow build / extended foreplay",
            fantasyPull: 3,
            actualPleasure: 4,
            description:
              "Gradual arousal through time, touch, and anticipation. Organizes nervous-system regulation and authority and reliability.",
          },
          {
            practice: "Passionate quickies",
            fantasyPull: 4,
            actualPleasure: 4,
            description:
              "Fast, urgent sex driven by impulse. Organizes excitement, release, and novelty.",
          },
          {
            practice: "Morning sex",
            fantasyPull: 3,
            actualPleasure: 2,
            description:
              "Gentle or energized intimacy after waking. Organizes comfort, frame stability, and bodily openness.",
          },
          {
            practice: "Sleeping / wake-up sex",
            fantasyPull: 4,
            actualPleasure: 5,
            description:
              "Intimacy while drifting in or out of sleep. Organizes earned surrender and softness.",
          },
          {
            practice: "After-argument / makeup sex",
            fantasyPull: 5,
            actualPleasure: 2,
            description: "Sex after conflict. Organizes emotional repair and tension discharge.",
          },
          {
            practice: "Romantic aftercare",
            fantasyPull: 4,
            actualPleasure: 3,
            description:
              "Cuddling, closeness, and reassurance after sex. Organizes emotional completion and control and consent.",
          },
          {
            practice: "Emotional vulnerability during sex",
            fantasyPull: 3,
            actualPleasure: 1,
            description:
              "Sharing feelings or being emotionally open while intimate. Organizes being seen and accepted.",
          },
          {
            practice: "Crying or emotional release",
            fantasyPull: 4,
            actualPleasure: 1,
            description:
              "Letting emotions surface during intimacy. Organizes catharsis and relief.",
          },
          {
            practice: "Emotional healing sex",
            fantasyPull: 2,
            actualPleasure: 1,
            description:
              "Using intimacy to soothe or repair emotionally. Organizes nervous-system regulation.",
          },
          {
            practice: "Spiritual merging / oneness",
            fantasyPull: 5,
            actualPleasure: 3,
            description:
              "Experiencing sex as a transcendent union. Organizes meaning and frame stability beyond self.",
          },
        ],
      },
      {
        title: "Touch, Sensory & Body-Based",
        rows: [
          {
            practice: "Sensual massage",
            fantasyPull: 3,
            actualPleasure: 3,
            description:
              "Slow, attentive touch meant to relax and awaken sensation. Organizes control and consent and body awareness.",
          },
          {
            practice: "Erotic massage exchange",
            fantasyPull: 3,
            actualPleasure: 4,
            description:
              "Partners take turns giving sensual touch. Organizes mutual giving and receiving.",
          },
          {
            practice: "Sensory play",
            fantasyPull: 6,
            actualPleasure: 5,
            description:
              "Using textures, sounds, or sensations to heighten awareness. Organizes curiosity and bodily focus.",
          },
          {
            practice: "Sensory deprivation / blindfolds",
            fantasyPull: 7,
            actualPleasure: 5,
            description:
              "Limiting senses to intensify others. Organizes surrender and concentration.",
          },
          {
            practice: "Temperature play",
            fantasyPull: 7,
            actualPleasure: 6,
            description:
              "Using warmth or coolness to stimulate nerves. Organizes novelty and alertness.",
          },
          {
            practice: "Slow synchronized breathing",
            fantasyPull: 3,
            actualPleasure: 2,
            description: "Breathing together. Organizes co-regulation and calm.",
          },
          {
            practice: "Mutual tantric gaze",
            fantasyPull: 4,
            actualPleasure: 3,
            description: "Holding eye contact for extended time. Organizes emotional presence.",
          },
          {
            practice: "Scent / pheromone play",
            fantasyPull: 4,
            actualPleasure: 4,
            description: "Using smell as an arousal cue. Organizes primal attraction.",
          },
          {
            practice: "Multi-sensory immersion",
            fantasyPull: 5,
            actualPleasure: 4,
            description:
              "Combining sound, touch, smell, and atmosphere. Organizes full-body engagement.",
          },
        ],
      },
      {
        title: "Giving vs Receiving Stimulation",
        rows: [
          {
            practice: "Giving oral",
            fantasyPull: 3,
            actualPleasure: 3,
            description: "Pleasing a partner with a mouth. Organizes caretaking and attentiveness.",
          },
          {
            practice: "Receiving oral",
            fantasyPull: 3,
            actualPleasure: 4,
            description:
              "Being pleasured by a partner’s mouth. Organizes feeling wanted and focused on.",
          },
          {
            practice: "Giving manual stimulation",
            fantasyPull: 3,
            actualPleasure: 2,
            description: "Pleasing a partner with hands. Organizes giving and responsiveness.",
          },
          {
            practice: "Receiving manual stimulation",
            fantasyPull: 2,
            actualPleasure: 3,
            description: "Being pleasured by touch. Organizes being held in erotic attention.",
          },
          {
            practice: "Mutual masturbation",
            fantasyPull: 4,
            actualPleasure: 4,
            description:
              "Both partners pleasure themselves together. Organizes shared presence with autonomy.",
          },
          {
            practice: "Masturbating in front of partner",
            fantasyPull: 6,
            actualPleasure: 5,
            description:
              "Self-pleasure while being watched. Organizes being desired without effort.",
          },
          {
            practice: "Using toys on partner",
            fantasyPull: 4,
            actualPleasure: 3,
            description: "Enhancing their sensation. Organizes caretaking and curiosity.",
          },
          {
            practice: "Having toys used on you",
            fantasyPull: 4,
            actualPleasure: 5,
            description: "Receiving intensified stimulation. Organizes surrender and focus.",
          },
        ],
      },
      {
        title: "Penetration & Body Opening",
        rows: [
          {
            practice: "Penetrating partner",
            fantasyPull: 2,
            actualPleasure: 2,
            description: "Being the active, initiating body. Organizes agency and movement.",
          },
          {
            practice: "Being penetrated",
            fantasyPull: 2,
            actualPleasure: 3,
            description:
              "Allowing the partner inside one’s body. Organizes surrender and openness.",
          },
          {
            practice: "Pegging",
            fantasyPull: 9,
            actualPleasure: 7,
            description:
              "Being penetrated by a partner using a device. Organizes role-reversal and authority and reliability.",
          },
          {
            practice: "Anal play (giving)",
            fantasyPull: 9,
            actualPleasure: 8,
            description: "Stimulating a partner anally. Organizes control and taboo.",
          },
          {
            practice: "Anal play (receiving)",
            fantasyPull: 9,
            actualPleasure: 6,
            description: "Being anally stimulated. Organizes earned surrender and surrender.",
          },
          {
            practice: "Double-penetration fantasy",
            fantasyPull: 10,
            actualPleasure: 10,
            description:
              "Imagining intense bodily overwhelm. Organizes extremity and fantasy of being overtaken.",
          },
        ],
      },
      {
        title: "Power & Role Dynamics",
        rows: [
          {
            practice: "Dominating",
            fantasyPull: 6,
            actualPleasure: 4,
            description: "Taking charge and directing the encounter. Organizes agency and control.",
          },
          {
            practice: "Submitting",
            fantasyPull: 6,
            actualPleasure: 3,
            description:
              "Letting the partner lead. Organizes authority and reliability and release of responsibility.",
          },
          {
            practice: "Romantic dominance",
            fantasyPull: 6,
            actualPleasure: 5,
            description:
              "Leading in a caring, protective way. Organizes control and consent and attraction.",
          },
          {
            practice: "Service submission",
            fantasyPull: 6,
            actualPleasure: 2,
            description:
              "Showing devotion by pleasing the partner. Organizes caretaking and meaning.",
          },
          {
            practice: "Worshipping partner",
            fantasyPull: 6,
            actualPleasure: 6,
            description:
              "Treating the partner as precious or ideal. Organizes devotion and admiration.",
          },
          {
            practice: "Being worshipped",
            fantasyPull: 4,
            actualPleasure: 4,
            description: "Being idealized and adored. Organizes validation and self-worth.",
          },
          {
            practice: "Master–slave (consensual)",
            fantasyPull: 10,
            actualPleasure: 7,
            description: "Formalized hierarchy. Organizes identity and power structure.",
          },
          {
            practice: "Power exchange (24/7 or partial)",
            fantasyPull: 10,
            actualPleasure: 8,
            description: "Maintaining roles inside and outside sex. Organizes lifestyle identity.",
          },
        ],
      },
      {
        title: "Pain, Restraint & Edge",
        rows: [
          {
            practice: "Giving impact (spanking, etc.)",
            fantasyPull: 9,
            actualPleasure: 7,
            description: "Applying controlled physical sensation. Organizes expression of power.",
          },
          {
            practice: "Receiving impact",
            fantasyPull: 9,
            actualPleasure: 6,
            description: "Experiencing strong sensation. Organizes surrender and intensity.",
          },
          {
            practice: "Biting / scratching",
            fantasyPull: 6,
            actualPleasure: 5,
            description: "Primal physical expression. Organizes animalistic energy.",
          },
          {
            practice: "Choking / neck holding (light, consensual)",
            fantasyPull: 10,
            actualPleasure: 7,
            description:
              "Heightened intensity through trust and risk. Organizes surrender and thrill.",
          },
          {
            practice: "Restraining partner",
            fantasyPull: 9,
            actualPleasure: 5,
            description: "Limiting movement. Organizes control and dominance.",
          },
          {
            practice: "Being restrained",
            fantasyPull: 9,
            actualPleasure: 4,
            description: "Having movement limited. Organizes surrender and focus.",
          },
          {
            practice: "Erotic pain endurance",
            fantasyPull: 10,
            actualPleasure: 8,
            description: "Holding a strong sensation. Organizes challenge and resilience.",
          },
          {
            practice: "Shibari / erotic rope art",
            fantasyPull: 10,
            actualPleasure: 5,
            description: "Aesthetic and emotional restraint. Organizes beauty and surrender.",
          },
        ],
      },
      {
        title: "Erotic Attention, Voyeurism & Third-Party Themes",
        rows: [
          {
            practice: "Being watched by partner",
            fantasyPull: 6,
            actualPleasure: 5,
            description: "Being held in a partner’s desire. Organizes validation and being chosen.",
          },
          {
            practice: "Watching your partner",
            fantasyPull: 6,
            actualPleasure: 6,
            description: "Witnessing their arousal. Organizes empathy and frame stability.",
          },
          {
            practice: "Voyeurism (watching others)",
            fantasyPull: 9,
            actualPleasure: 8,
            description: "Observing from emotional distance. Organizes curiosity and fantasy.",
          },
          {
            practice: "Exhibitionism",
            fantasyPull: 10,
            actualPleasure: 10,
            description: "Being visible to others. Organizes validation and performance.",
          },
          {
            practice: "Public or semi-public play",
            fantasyPull: 10,
            actualPleasure: 9,
            description: "Risk of being discovered. Organizes thrill and taboo.",
          },
          {
            practice: "Public teasing",
            fantasyPull: 9,
            actualPleasure: 9,
            description: "Secret intimacy in public. Organizes anticipation and loyalty.",
          },
          {
            practice: "Being watched secretly by partner",
            fantasyPull: 9,
            actualPleasure: 7,
            description: "Being desired without performing. Organizes effortless validation.",
          },
          {
            practice: "Forced voyeurism fantasy",
            fantasyPull: 9,
            actualPleasure: 10,
            description: "Losing control over who sees you. Organizes exposure and powerlessness.",
          },
          {
            practice: "Cuckold (partner with others)",
            fantasyPull: 8,
            actualPleasure: 10,
            description:
              "Eroticized jealousy and loss of status. Organizes insecurity and surrender.",
          },
          {
            practice: "Hotwifing",
            fantasyPull: 8,
            actualPleasure: 8,
            description:
              "Sharing partner to feel pride and reflected desirability. Organizes status and validation.",
          },
          {
            practice: "Group sex / threesomes",
            fantasyPull: 10,
            actualPleasure: 8,
            description: "Multiple streams of desire. Organizes novelty and attention.",
          },
          {
            practice: "Anonymous encounter fantasy",
            fantasyPull: 10,
            actualPleasure: 7,
            description: "Being desired without being known. Organizes freedom from identity.",
          },
        ],
      },
      {
        title: "Fetish, Identity & Body-Focus",
        rows: [
          {
            practice: "Foot fetish",
            fantasyPull: 7,
            actualPleasure: 7,
            description: "Focus on a specific body part. Organizes symbolic attraction.",
          },
          {
            practice: "Hair fetish",
            fantasyPull: 4,
            actualPleasure: 4,
            description: "Arousal from hair. Organizes sensory fixation.",
          },
          {
            practice: "Breasts / nipple play",
            fantasyPull: 3,
            actualPleasure: 3,
            description: "Chest-focused stimulation. Organizes nurturance and pleasure.",
          },
          {
            practice: "Hands / legs / thighs",
            fantasyPull: 3,
            actualPleasure: 4,
            description: "Body-part focus. Organizes visual and tactile attraction.",
          },
          {
            practice: "Voice fetish",
            fantasyPull: 4,
            actualPleasure: 5,
            description: "Arousal from sound. Organizes emotional resonance.",
          },
          {
            practice: "Cross-dressing / gender play",
            fantasyPull: 9,
            actualPleasure: 7,
            description:
              "Wearing or exploring different gendered roles. Organizes identity exploration.",
          },
          {
            practice: "Lingerie / fetish wear",
            fantasyPull: 6,
            actualPleasure: 5,
            description: "Erotic clothing. Organizes display and identity.",
          },
          {
            practice: "Worshipping partner’s body",
            fantasyPull: 4,
            actualPleasure: 3,
            description: "Admiring the partner’s physical form. Organizes devotion.",
          },
        ],
      },
      {
        title: "Taboo, Fluids & Extreme Kink",
        rows: [
          {
            practice: "Cum play",
            fantasyPull: 9,
            actualPleasure: 8,
            description: "Focus on sexual fluids. Organizes taboo and intimacy.",
          },
          {
            practice: "Pee / golden shower",
            fantasyPull: 10,
            actualPleasure: 10,
            description: "Using urine as a taboo element. Organizes transgression.",
          },
          {
            practice: "Scat",
            fantasyPull: 10,
            actualPleasure: 9,
            description: "Using feces as erotic element. Organizes extreme taboo.",
          },
          {
            practice: "Breeding fantasy",
            fantasyPull: 9,
            actualPleasure: 9,
            description: "Imagining impregnation. Organizes fertility and legacy.",
          },
          {
            practice: "Pregnancy play",
            fantasyPull: 10,
            actualPleasure: 8,
            description: "Eroticizing pregnancy. Organizes nurture and taboo.",
          },
          {
            practice: "Lactation play",
            fantasyPull: 8,
            actualPleasure: 8,
            description: "Milk as erotic symbol. Organizes nurturance.",
          },
          {
            practice: "Object insertion",
            fantasyPull: 9,
            actualPleasure: 7,
            description: "Using non-sexual objects. Organizes novelty and taboo.",
          },
          {
            practice: "Food play",
            fantasyPull: 6,
            actualPleasure: 5,
            description: "Using food in erotic context. Organizes sensory transgression.",
          },
        ],
      },
      {
        title: "Technology & Distance",
        rows: [
          {
            practice: "Sexting",
            fantasyPull: 6,
            actualPleasure: 5,
            description: "Sending erotic messages. Organizes anticipation and desire.",
          },
          {
            practice: "Erotic voice / audio",
            fantasyPull: 3,
            actualPleasure: 3,
            description: "Hearing arousing speech. Organizes intimacy through sound.",
          },
          {
            practice: "Erotic photography / filming",
            fantasyPull: 9,
            actualPleasure: 8,
            description: "Recording intimacy. Organizes being seen and remembered.",
          },
          {
            practice: "Mutual video masturbation",
            fantasyPull: 6,
            actualPleasure: 6,
            description: "Remote shared arousal. Organizes frame stability across distance.",
          },
          {
            practice: "Long-distance sexual play",
            fantasyPull: 3,
            actualPleasure: 4,
            description: "Maintaining intimacy when apart. Organizes emotional continuity.",
          },
        ],
      },
      {
        title: "Ritual, Tantra & Conscious Sex",
        rows: [
          {
            practice: "Tantra / spiritual sexuality",
            fantasyPull: 5,
            actualPleasure: 4,
            description: "Presence-based intimacy. Organizes awareness and depth.",
          },
          {
            practice: "Sacred kink",
            fantasyPull: 7,
            actualPleasure: 4,
            description: "Ritualized erotic power. Organizes meaning and transformation.",
          },
          {
            practice: "Sensual rituals",
            fantasyPull: 3,
            actualPleasure: 3,
            description: "Structured, intentional intimacy. Organizes focus and frame stability.",
          },
          {
            practice: "Mirror sex",
            fantasyPull: 6,
            actualPleasure: 5,
            description: "Watching oneself and partner. Organizes self-awareness.",
          },
          {
            practice: "Mutual surrender experience",
            fantasyPull: 5,
            actualPleasure: 3,
            description: "Letting go together. Organizes authority and reliability and union.",
          },
          {
            practice: "Shadow work through sex",
            fantasyPull: 7,
            actualPleasure: 2,
            description: "Exploring shame or hidden parts. Organizes integration.",
          },
        ],
      },
    ],
  },
  "Loyal Ritualist": {
    introBlocks: [
      "<p>These scores <strong>do not define you as an individual</strong>. They are <strong>probability-based estimates derived from aggregated research and observed patterns across archetypes.</strong></p>",
      "<p>They <strong>reflect what is statistically more common, not what is fixed or deterministic for you individually.</strong> Every person is unique, and real-world preferences are shaped by personal experience, context, development, and the combination of multiple archetypes within you.</p>",
      "<p>This means your actual desires, boundaries, and experiences may align with, differ from, or evolve beyond these patterns — sometimes significantly.</p>",
      "<p>We present two separate metrics on a 10-point scale:</p>",
      "<ul><li><strong>Fantasy Pull:</strong> how strongly a theme tends to appear in imagination, curiosity, or arousal</li><li><strong>Lived Pleasure:</strong> how likely the same theme is to feel grounding, pleasurable, and genuinely good when experienced in real life</li></ul>",
      "<p><strong>Fantasy Pull:</strong></p>",
      "<ul><li><strong>High</strong> (7–10): More likely to feel mentally engaging, arousing, or intriguing in imagination.</li><li><strong>Low</strong> (1–4): Less likely to capture attention or appear in imagination arousing.</li></ul>",
      "<p><strong>Actual Pleasure:</strong></p>",
      "<ul><li><strong>High</strong> (7–10): More likely to feel physically and/or emotionally satisfying in real-life experience (given the right context, such as trust and safety).</li><li><strong>Low</strong> (1–4): Less likely to feel rewarding, pleasurable or to resonate strongly in practice</li></ul>",
      "<p><strong>How to read combinations of scores</strong></p>",
      "<p>Because Fantasy Pull and Lived Pleasure are independent, the relationship between them matters. Looking at both together helps you understand how a theme tends to show up in your mind vs. in real experience.</p>",
      "<p><strong>Low Fantasy + Low Pleasure</strong> → Generally not relevant<br />This suggests a theme is neither mentally engaging nor particularly rewarding in practice. Typically something to deprioritize, unless curiosity emerges naturally over time.</p>",
      "<p><strong>Low Fantasy + High Pleasure</strong> → Better in reality than in imagination</p>",
      "<p>You may not think about it much, but when experienced, it can feel surprisingly good or fulfilling. Often worth gently exploring in real-life contexts, as these areas can reveal unexpected compatibility.</p>",
      "<p><strong>High Fantasy + Low Pleasure</strong> → Stronger in imagination than in reality<br />There is a strong mental or symbolic attraction, but less consistent satisfaction in practice. Calls for conscious exploration and adjustment — refining context, pace, or boundaries — or keeping parts of it in fantasy where it feels most aligned.</p>",
      "<p><strong>High Fantasy + High Pleasure</strong> → Alignment between mind and experience<br />What feels exciting in imagination is also likely to feel good in reality. These are areas to lean into and deepen, often representing natural sources of fulfillment and ease.</p>",
    ],
    groups: [
      {
        title: "Core Relational & Embodied",
        rows: [
          {
            practice: "Romantic lovemaking",
            fantasyPull: 6,
            actualPleasure: 8,
            description:
              "Sex centered on affection, tenderness, and feeling emotionally chosen. Organizes attachment, stability, and commitment.",
          },
          {
            practice: "Slow build / extended foreplay",
            fantasyPull: 6,
            actualPleasure: 9,
            description:
              "Gradual arousal through time, touch, and anticipation. Organizes nervous-system regulation and continuity.",
          },
          {
            practice: "Passionate quickies",
            fantasyPull: 3,
            actualPleasure: 3,
            description:
              "Fast, urgent sex driven by impulse. Organizes reassurance, release, and safe evolution.",
          },
          {
            practice: "Morning sex",
            fantasyPull: 4,
            actualPleasure: 5,
            description:
              "Gentle or energized intimacy after waking. Organizes comfort, connection, and bodily openness.",
          },
          {
            practice: "Sleeping / wake-up sex",
            fantasyPull: 5,
            actualPleasure: 6,
            description:
              "Intimacy while drifting in or out of sleep. Organizes vulnerability and softness.",
          },
          {
            practice: "After-argument / makeup sex",
            fantasyPull: 5,
            actualPleasure: 4,
            description: "Sex after conflict. Organizes emotional repair and tension discharge.",
          },
          {
            practice: "Romantic aftercare",
            fantasyPull: 7,
            actualPleasure: 8,
            description:
              "Cuddling, closeness, and reassurance after sex. Organizes emotional completion and stability.",
          },
          {
            practice: "Emotional vulnerability during sex",
            fantasyPull: 6,
            actualPleasure: 7,
            description:
              "Sharing feelings or being emotionally open while intimate. Organizes being seen and accepted.",
          },
          {
            practice: "Crying or emotional release",
            fantasyPull: 6,
            actualPleasure: 6,
            description:
              "Letting emotions surface during intimacy. Organizes catharsis and relief.",
          },
          {
            practice: "Emotional healing sex",
            fantasyPull: 7,
            actualPleasure: 7,
            description:
              "Using intimacy to soothe or repair emotionally. Organizes nervous-system regulation.",
          },
          {
            practice: "Spiritual merging / oneness",
            fantasyPull: 7,
            actualPleasure: 9,
            description:
              "Experiencing sex as a transcendent union. Organizes meaning and connection beyond self.",
          },
        ],
      },
      {
        title: "Touch, Sensory & Body-Based",
        rows: [
          {
            practice: "Sensual massage",
            fantasyPull: 6,
            actualPleasure: 8,
            description:
              "Slow, attentive touch meant to relax and awaken sensation. Organizes stability and body awareness.",
          },
          {
            practice: "Erotic massage exchange",
            fantasyPull: 6,
            actualPleasure: 9,
            description:
              "Partners take turns giving sensual touch. Organizes mutual giving and receiving.",
          },
          {
            practice: "Sensory play",
            fantasyPull: 6,
            actualPleasure: 5,
            description:
              "Using textures, sounds, or sensations to heighten awareness. Organizes curiosity and bodily focus.",
          },
          {
            practice: "Sensory deprivation / blindfolds",
            fantasyPull: 3,
            actualPleasure: 2,
            description:
              "Limiting senses to intensify others. Organizes surrender and concentration.",
          },
          {
            practice: "Temperature play",
            fantasyPull: 3,
            actualPleasure: 3,
            description:
              "Using warmth or coolness to stimulate nerves. Organizes safe evolution and alertness.",
          },
          {
            practice: "Slow synchronized breathing",
            fantasyPull: 6,
            actualPleasure: 7,
            description: "Breathing together. Organizes co-regulation and calm.",
          },
          {
            practice: "Mutual tantric gaze",
            fantasyPull: 5,
            actualPleasure: 8,
            description: "Holding eye contact for extended time. Organizes emotional presence.",
          },
          {
            practice: "Scent / pheromone play",
            fantasyPull: 5,
            actualPleasure: 6,
            description: "Using smell as an arousal cue. Organizes primal attraction.",
          },
          {
            practice: "Multi-sensory immersion",
            fantasyPull: 7,
            actualPleasure: 8,
            description:
              "Combining sound, touch, smell, and atmosphere. Organizes full-body engagement.",
          },
        ],
      },
      {
        title: "Giving vs Receiving Stimulation",
        rows: [
          {
            practice: "Giving oral",
            fantasyPull: 4,
            actualPleasure: 5,
            description: "Pleasing a partner with a mouth. Organizes caretaking and attentiveness.",
          },
          {
            practice: "Receiving oral",
            fantasyPull: 4,
            actualPleasure: 6,
            description:
              "Being pleasured by a partner’s mouth. Organizes feeling wanted and focused on.",
          },
          {
            practice: "Giving manual stimulation",
            fantasyPull: 4,
            actualPleasure: 4,
            description: "Pleasing a partner with hands. Organizes giving and responsiveness.",
          },
          {
            practice: "Receiving manual stimulation",
            fantasyPull: 5,
            actualPleasure: 5,
            description: "Being pleasured by touch. Organizes being held in erotic attention.",
          },
          {
            practice: "Mutual masturbation",
            fantasyPull: 3,
            actualPleasure: 2,
            description:
              "Both partners pleasure themselves together. Organizes shared presence with autonomy.",
          },
          {
            practice: "Masturbating in front of partner",
            fantasyPull: 3,
            actualPleasure: 1,
            description:
              "Self-pleasure while being watched. Organizes being desired without effort.",
          },
          {
            practice: "Using toys on partner",
            fantasyPull: 3,
            actualPleasure: 3,
            description: "Enhancing their sensation. Organizes caretaking and curiosity.",
          },
          {
            practice: "Having toys used on you",
            fantasyPull: 4,
            actualPleasure: 2,
            description: "Receiving intensified stimulation. Organizes surrender and focus.",
          },
        ],
      },
      {
        title: "Penetration & Body Opening",
        rows: [
          {
            practice: "Penetrating partner",
            fantasyPull: 2,
            actualPleasure: 2,
            description: "Being the active, initiating body. Organizes agency and movement.",
          },
          {
            practice: "Being penetrated",
            fantasyPull: 2,
            actualPleasure: 3,
            description:
              "Allowing the partner inside one’s body. Organizes surrender and openness.",
          },
          {
            practice: "Pegging",
            fantasyPull: 4,
            actualPleasure: 1,
            description:
              "Being penetrated by a partner using a device. Organizes role-reversal and continuity.",
          },
          {
            practice: "Anal play (giving)",
            fantasyPull: 4,
            actualPleasure: 2,
            description: "Stimulating a partner anally. Organizes control and taboo.",
          },
          {
            practice: "Anal play (receiving)",
            fantasyPull: 5,
            actualPleasure: 1,
            description: "Being anally stimulated. Organizes vulnerability and surrender.",
          },
          {
            practice: "Double-penetration fantasy",
            fantasyPull: 3,
            actualPleasure: 1,
            description:
              "Imagining intense bodily overwhelm. Organizes extremity and fantasy of being overtaken.",
          },
        ],
      },
      {
        title: "Power & Role Dynamics",
        rows: [
          {
            practice: "Dominating",
            fantasyPull: 3,
            actualPleasure: 2,
            description: "Taking charge and directing the encounter. Organizes agency and control.",
          },
          {
            practice: "Submitting",
            fantasyPull: 6,
            actualPleasure: 5,
            description:
              "Letting the partner lead. Organizes continuity and release of responsibility.",
          },
          {
            practice: "Romantic dominance",
            fantasyPull: 6,
            actualPleasure: 4,
            description: "Leading in a caring, protective way. Organizes stability and attraction.",
          },
          {
            practice: "Service submission",
            fantasyPull: 7,
            actualPleasure: 5,
            description:
              "Showing devotion by pleasing the partner. Organizes caretaking and meaning.",
          },
          {
            practice: "Worshipping partner",
            fantasyPull: 6,
            actualPleasure: 6,
            description:
              "Treating the partner as precious or ideal. Organizes devotion and admiration.",
          },
          {
            practice: "Being worshipped",
            fantasyPull: 5,
            actualPleasure: 5,
            description:
              "Being idealized and adored. Organizes loyalty confirmation and self-worth.",
          },
          {
            practice: "Master–slave (consensual)",
            fantasyPull: 4,
            actualPleasure: 1,
            description: "Formalized hierarchy. Organizes identity and power structure.",
          },
          {
            practice: "Power exchange (24/7 or partial)",
            fantasyPull: 4,
            actualPleasure: 2,
            description: "Maintaining roles inside and outside sex. Organizes lifestyle identity.",
          },
        ],
      },
      {
        title: "Pain, Restraint & Edge",
        rows: [
          {
            practice: "Giving impact (spanking, etc.)",
            fantasyPull: 4,
            actualPleasure: 1,
            description: "Applying controlled physical sensation. Organizes expression of power.",
          },
          {
            practice: "Receiving impact",
            fantasyPull: 4,
            actualPleasure: 2,
            description: "Experiencing strong sensation. Organizes surrender and intensity.",
          },
          {
            practice: "Biting / scratching",
            fantasyPull: 3,
            actualPleasure: 2,
            description: "Primal physical expression. Organizes animalistic energy.",
          },
          {
            practice: "Choking / neck holding (light, consensual)",
            fantasyPull: 5,
            actualPleasure: 1,
            description:
              "Heightened intensity through trust and risk. Organizes surrender and thrill.",
          },
          {
            practice: "Restraining partner",
            fantasyPull: 3,
            actualPleasure: 1,
            description: "Limiting movement. Organizes control and dominance.",
          },
          {
            practice: "Being restrained",
            fantasyPull: 5,
            actualPleasure: 2,
            description: "Having movement limited. Organizes surrender and focus.",
          },
          {
            practice: "Erotic pain endurance",
            fantasyPull: 4,
            actualPleasure: 3,
            description: "Holding a strong sensation. Organizes challenge and resilience.",
          },
          {
            practice: "Shibari / erotic rope art",
            fantasyPull: 6,
            actualPleasure: 1,
            description: "Aesthetic and emotional restraint. Organizes beauty and surrender.",
          },
        ],
      },
      {
        title: "Erotic Attention, Voyeurism & Third-Party Themes",
        rows: [
          {
            practice: "Being watched by partner",
            fantasyPull: 6,
            actualPleasure: 5,
            description:
              "Being held in a partner’s desire. Organizes loyalty confirmation and being chosen.",
          },
          {
            practice: "Watching your partner",
            fantasyPull: 6,
            actualPleasure: 6,
            description: "Witnessing their arousal. Organizes empathy and connection.",
          },
          {
            practice: "Voyeurism (watching others)",
            fantasyPull: 4,
            actualPleasure: 2,
            description: "Observing from emotional distance. Organizes curiosity and fantasy.",
          },
          {
            practice: "Exhibitionism",
            fantasyPull: 4,
            actualPleasure: 1,
            description: "Being visible to others. Organizes loyalty confirmation and performance.",
          },
          {
            practice: "Public or semi-public play",
            fantasyPull: 5,
            actualPleasure: 1,
            description: "Risk of being discovered. Organizes thrill and taboo.",
          },
          {
            practice: "Public teasing",
            fantasyPull: 3,
            actualPleasure: 1,
            description: "Secret intimacy in public. Organizes anticipation and commitment.",
          },
          {
            practice: "Being watched secretly by partner",
            fantasyPull: 3,
            actualPleasure: 2,
            description:
              "Being desired without performing. Organizes effortless loyalty confirmation.",
          },
          {
            practice: "Forced voyeurism fantasy",
            fantasyPull: 5,
            actualPleasure: 2,
            description: "Losing control over who sees you. Organizes exposure and powerlessness.",
          },
          {
            practice: "Cuckold (partner with others)",
            fantasyPull: 4,
            actualPleasure: 3,
            description:
              "Eroticized jealousy and loss of status. Organizes insecurity and surrender.",
          },
          {
            practice: "Hotwifing",
            fantasyPull: 6,
            actualPleasure: 1,
            description:
              "Sharing partner to feel pride and reflected desirability. Organizes status and loyalty confirmation.",
          },
          {
            practice: "Group sex / threesomes",
            fantasyPull: 2,
            actualPleasure: 1,
            description: "Multiple streams of desire. Organizes safe evolution and attention.",
          },
          {
            practice: "Anonymous encounter fantasy",
            fantasyPull: 2,
            actualPleasure: 3,
            description: "Being desired without being known. Organizes freedom from identity.",
          },
        ],
      },
      {
        title: "Fetish, Identity & Body-Focus",
        rows: [
          {
            practice: "Foot fetish",
            fantasyPull: 3,
            actualPleasure: 2,
            description: "Focus on a specific body part. Organizes symbolic attraction.",
          },
          {
            practice: "Hair fetish",
            fantasyPull: 3,
            actualPleasure: 3,
            description: "Arousal from hair. Organizes sensory fixation.",
          },
          {
            practice: "Breasts / nipple play",
            fantasyPull: 4,
            actualPleasure: 5,
            description: "Chest-focused stimulation. Organizes nurturance and pleasure.",
          },
          {
            practice: "Hands / legs / thighs",
            fantasyPull: 4,
            actualPleasure: 6,
            description: "Body-part focus. Organizes visual and tactile attraction.",
          },
          {
            practice: "Voice fetish",
            fantasyPull: 5,
            actualPleasure: 6,
            description: "Arousal from sound. Organizes emotional resonance.",
          },
          {
            practice: "Cross-dressing / gender play",
            fantasyPull: 4,
            actualPleasure: 1,
            description:
              "Wearing or exploring different gendered roles. Organizes identity exploration.",
          },
          {
            practice: "Lingerie / fetish wear",
            fantasyPull: 6,
            actualPleasure: 5,
            description: "Erotic clothing. Organizes display and identity.",
          },
          {
            practice: "Worshipping partner’s body",
            fantasyPull: 5,
            actualPleasure: 7,
            description: "Admiring the partner’s physical form. Organizes devotion.",
          },
        ],
      },
      {
        title: "Taboo, Fluids & Extreme Kink",
        rows: [
          {
            practice: "Cum play",
            fantasyPull: 4,
            actualPleasure: 1,
            description: "Focus on sexual fluids. Organizes taboo and intimacy.",
          },
          {
            practice: "Pee / golden shower",
            fantasyPull: 5,
            actualPleasure: 1,
            description: "Using urine as a taboo element. Organizes transgression.",
          },
          {
            practice: "Scat",
            fantasyPull: 3,
            actualPleasure: 1,
            description: "Using feces as erotic element. Organizes extreme taboo.",
          },
          {
            practice: "Breeding fantasy",
            fantasyPull: 4,
            actualPleasure: 2,
            description: "Imagining impregnation. Organizes fertility and legacy.",
          },
          {
            practice: "Pregnancy play",
            fantasyPull: 5,
            actualPleasure: 2,
            description: "Eroticizing pregnancy. Organizes nurture and taboo.",
          },
          {
            practice: "Lactation play",
            fantasyPull: 4,
            actualPleasure: 3,
            description: "Milk as erotic symbol. Organizes nurturance.",
          },
          {
            practice: "Object insertion",
            fantasyPull: 6,
            actualPleasure: 1,
            description: "Using non-sexual objects. Organizes safe evolution and taboo.",
          },
          {
            practice: "Food play",
            fantasyPull: 3,
            actualPleasure: 2,
            description: "Using food in erotic context. Organizes sensory transgression.",
          },
        ],
      },
      {
        title: "Technology & Distance",
        rows: [
          {
            practice: "Sexting",
            fantasyPull: 3,
            actualPleasure: 2,
            description: "Sending erotic messages. Organizes anticipation and desire.",
          },
          {
            practice: "Erotic voice / audio",
            fantasyPull: 4,
            actualPleasure: 5,
            description: "Hearing arousing speech. Organizes intimacy through sound.",
          },
          {
            practice: "Erotic photography / filming",
            fantasyPull: 4,
            actualPleasure: 1,
            description: "Recording intimacy. Organizes being seen and remembered.",
          },
          {
            practice: "Mutual video masturbation",
            fantasyPull: 3,
            actualPleasure: 1,
            description: "Remote shared arousal. Organizes connection across distance.",
          },
          {
            practice: "Long-distance sexual play",
            fantasyPull: 4,
            actualPleasure: 6,
            description: "Maintaining intimacy when apart. Organizes emotional continuity.",
          },
        ],
      },
      {
        title: "Ritual, Tantra & Conscious Sex",
        rows: [
          {
            practice: "Tantra / spiritual sexuality",
            fantasyPull: 7,
            actualPleasure: 8,
            description: "Presence-based intimacy. Organizes awareness and depth.",
          },
          {
            practice: "Sacred kink",
            fantasyPull: 7,
            actualPleasure: 9,
            description: "Ritualized erotic power. Organizes meaning and transformation.",
          },
          {
            practice: "Sensual rituals",
            fantasyPull: 6,
            actualPleasure: 8,
            description: "Structured, intentional intimacy. Organizes focus and connection.",
          },
          {
            practice: "Mirror sex",
            fantasyPull: 3,
            actualPleasure: 1,
            description: "Watching oneself and partner. Organizes self-awareness.",
          },
          {
            practice: "Mutual surrender experience",
            fantasyPull: 8,
            actualPleasure: 8,
            description: "Letting go together. Organizes continuity and union.",
          },
          {
            practice: "Shadow work through sex",
            fantasyPull: 7,
            actualPleasure: 7,
            description: "Exploring shame or hidden parts. Organizes integration.",
          },
        ],
      },
    ],
  },
  "Tender Devotee": {
    introBlocks: [
      "<p>These scores <strong>do not define you as an individual</strong>. They are <strong>probability-based estimates derived from aggregated research and observed patterns across archetypes.</strong></p>",
      "<p>They <strong>reflect what is statistically more common, not what is fixed or deterministic for you individually.</strong> Every person is unique, and real-world preferences are shaped by personal experience, context, development, and the combination of multiple archetypes within you.</p>",
      "<p>This means your actual desires, boundaries, and experiences may align with, differ from, or evolve beyond these patterns — sometimes significantly.</p>",
      "<p>We present two separate metrics on a 10-point scale:</p>",
      "<ul><li><strong>Fantasy Pull:</strong> how strongly a theme tends to appear in imagination, curiosity, or arousal</li><li><strong>Lived Pleasure:</strong> how likely the same theme is to feel grounding, pleasurable, and genuinely good when experienced in real life</li></ul>",
      "<p><strong>Fantasy Pull:</strong></p>",
      "<ul><li><strong>High</strong> (7–10): More likely to feel mentally engaging, arousing, or intriguing in imagination.</li><li><strong>Low</strong> (1–4): Less likely to capture attention or appear in imagination arousing.</li></ul>",
      "<p><strong>Actual Pleasure:</strong></p>",
      "<ul><li><strong>High</strong> (7–10): More likely to feel physically and/or emotionally satisfying in real-life experience (given the right context, such as trust and safety).</li><li><strong>Low</strong> (1–4): Less likely to feel rewarding, pleasurable or to resonate strongly in practice</li></ul>",
      "<p><strong>How to read combinations of scores</strong></p>",
      "<p>Because Fantasy Pull and Lived Pleasure are independent, the relationship between them matters. Looking at both together helps you understand how a theme tends to show up in your mind vs. in real experience.</p>",
      "<p><strong>Low Fantasy + Low Pleasure</strong> → Generally not relevant<br />This suggests a theme is neither mentally engaging nor particularly rewarding in practice. Typically something to deprioritize, unless curiosity emerges naturally over time.</p>",
      "<p><strong>Low Fantasy + High Pleasure</strong> → Better in reality than in imagination</p>",
      "<p>You may not think about it much, but when experienced, it can feel surprisingly good or fulfilling. Often worth gently exploring in real-life contexts, as these areas can reveal unexpected compatibility.</p>",
      "<p><strong>High Fantasy + Low Pleasure</strong> → Stronger in imagination than in reality<br />There is a strong mental or symbolic attraction, but less consistent satisfaction in practice. Calls for conscious exploration and adjustment — refining context, pace, or boundaries — or keeping parts of it in fantasy where it feels most aligned.</p>",
      "<p><strong>High Fantasy + High Pleasure</strong> → Alignment between mind and experience<br />What feels exciting in imagination is also likely to feel good in reality. These are areas to lean into and deepen, often representing natural sources of fulfillment and ease.</p>",
    ],
    groups: [
      {
        title: "Core Relational & Embodied",
        rows: [
          {
            practice: "Romantic lovemaking",
            fantasyPull: 5,
            actualPleasure: 7,
            description:
              "Sex centered on affection, tenderness, and feeling emotionally chosen. Organizes attachment, reassurance, and being chosen.",
          },
          {
            practice: "Slow build / extended foreplay",
            fantasyPull: 5,
            actualPleasure: 8,
            description:
              "Gradual arousal through time, touch, and anticipation. Organizes nervous-system regulation and acceptance.",
          },
          {
            practice: "Passionate quickies",
            fantasyPull: 3,
            actualPleasure: 3,
            description:
              "Fast, urgent sex driven by impulse. Organizes excitement, release, and novelty.",
          },
          {
            practice: "Morning sex",
            fantasyPull: 4,
            actualPleasure: 5,
            description:
              "Gentle or energized intimacy after waking. Organizes comfort, connection, and bodily openness.",
          },
          {
            practice: "Sleeping / wake-up sex",
            fantasyPull: 5,
            actualPleasure: 5,
            description:
              "Intimacy while drifting in or out of sleep. Organizes acceptance and softness.",
          },
          {
            practice: "After-argument / makeup sex",
            fantasyPull: 5,
            actualPleasure: 2,
            description: "Sex after conflict. Organizes emotional repair and tension discharge.",
          },
          {
            practice: "Romantic aftercare",
            fantasyPull: 5,
            actualPleasure: 6,
            description:
              "Cuddling, closeness, and reassurance after sex. Organizes emotional completion and reassurance.",
          },
          {
            practice: "Emotional vulnerability during sex",
            fantasyPull: 5,
            actualPleasure: 4,
            description:
              "Sharing feelings or being emotionally open while intimate. Organizes being seen and accepted.",
          },
          {
            practice: "Crying or emotional release",
            fantasyPull: 5,
            actualPleasure: 3,
            description:
              "Letting emotions surface during intimacy. Organizes catharsis and relief.",
          },
          {
            practice: "Emotional healing sex",
            fantasyPull: 6,
            actualPleasure: 4,
            description:
              "Using intimacy to soothe or repair emotionally. Organizes nervous-system regulation.",
          },
          {
            practice: "Spiritual merging / oneness",
            fantasyPull: 6,
            actualPleasure: 6,
            description:
              "Experiencing sex as a transcendent union. Organizes meaning and connection beyond self.",
          },
        ],
      },
      {
        title: "Touch, Sensory & Body-Based",
        rows: [
          {
            practice: "Sensual massage",
            fantasyPull: 5,
            actualPleasure: 7,
            description:
              "Slow, attentive touch meant to relax and awaken sensation. Organizes reassurance and body awareness.",
          },
          {
            practice: "Erotic massage exchange",
            fantasyPull: 5,
            actualPleasure: 8,
            description:
              "Partners take turns giving sensual touch. Organizes mutual giving and receiving.",
          },
          {
            practice: "Sensory play",
            fantasyPull: 5,
            actualPleasure: 4,
            description:
              "Using textures, sounds, or sensations to heighten awareness. Organizes curiosity and bodily focus.",
          },
          {
            practice: "Sensory deprivation / blindfolds",
            fantasyPull: 5,
            actualPleasure: 1,
            description:
              "Limiting senses to intensify others. Organizes surrender and concentration.",
          },
          {
            practice: "Temperature play",
            fantasyPull: 5,
            actualPleasure: 3,
            description:
              "Using warmth or coolness to stimulate nerves. Organizes novelty and alertness.",
          },
          {
            practice: "Slow synchronized breathing",
            fantasyPull: 5,
            actualPleasure: 6,
            description: "Breathing together. Organizes co-regulation and calm.",
          },
          {
            practice: "Mutual tantric gaze",
            fantasyPull: 6,
            actualPleasure: 7,
            description: "Holding eye contact for extended time. Organizes emotional presence.",
          },
          {
            practice: "Scent / pheromone play",
            fantasyPull: 5,
            actualPleasure: 5,
            description: "Using smell as an arousal cue. Organizes primal attraction.",
          },
          {
            practice: "Multi-sensory immersion",
            fantasyPull: 6,
            actualPleasure: 6,
            description:
              "Combining sound, touch, smell, and atmosphere. Organizes full-body engagement.",
          },
        ],
      },
      {
        title: "Giving vs Receiving Stimulation",
        rows: [
          {
            practice: "Giving oral",
            fantasyPull: 4,
            actualPleasure: 5,
            description: "Pleasing a partner with a mouth. Organizes caretaking and attentiveness.",
          },
          {
            practice: "Receiving oral",
            fantasyPull: 4,
            actualPleasure: 4,
            description:
              "Being pleasured by a partner’s mouth. Organizes feeling wanted and focused on.",
          },
          {
            practice: "Giving manual stimulation",
            fantasyPull: 4,
            actualPleasure: 6,
            description: "Pleasing a partner with hands. Organizes giving and responsiveness.",
          },
          {
            practice: "Receiving manual stimulation",
            fantasyPull: 4,
            actualPleasure: 3,
            description: "Being pleasured by touch. Organizes being held in erotic attention.",
          },
          {
            practice: "Mutual masturbation",
            fantasyPull: 3,
            actualPleasure: 2,
            description:
              "Both partners pleasure themselves together. Organizes shared presence with autonomy.",
          },
          {
            practice: "Masturbating in front of partner",
            fantasyPull: 4,
            actualPleasure: 1,
            description:
              "Self-pleasure while being watched. Organizes being desired without effort.",
          },
          {
            practice: "Using toys on partner",
            fantasyPull: 3,
            actualPleasure: 3,
            description: "Enhancing their sensation. Organizes caretaking and curiosity.",
          },
          {
            practice: "Having toys used on you",
            fantasyPull: 3,
            actualPleasure: 1,
            description: "Receiving intensified stimulation. Organizes surrender and focus.",
          },
        ],
      },
      {
        title: "Penetration & Body Opening",
        rows: [
          {
            practice: "Penetrating partner",
            fantasyPull: 2,
            actualPleasure: 2,
            description: "Being the active, initiating body. Organizes agency and movement.",
          },
          {
            practice: "Being penetrated",
            fantasyPull: 2,
            actualPleasure: 3,
            description:
              "Allowing the partner inside one’s body. Organizes surrender and openness.",
          },
          {
            practice: "Pegging",
            fantasyPull: 5,
            actualPleasure: 1,
            description:
              "Being penetrated by a partner using a device. Organizes role-reversal and acceptance.",
          },
          {
            practice: "Anal play (giving)",
            fantasyPull: 5,
            actualPleasure: 2,
            description: "Stimulating a partner anally. Organizes control and taboo.",
          },
          {
            practice: "Anal play (receiving)",
            fantasyPull: 6,
            actualPleasure: 1,
            description: "Being anally stimulated. Organizes acceptance and surrender.",
          },
          {
            practice: "Double-penetration fantasy",
            fantasyPull: 7,
            actualPleasure: 3,
            description:
              "Imagining intense bodily overwhelm. Organizes extremity and fantasy of being overtaken.",
          },
        ],
      },
      {
        title: "Power & Role Dynamics",
        rows: [
          {
            practice: "Dominating",
            fantasyPull: 4,
            actualPleasure: 1,
            description: "Taking charge and directing the encounter. Organizes agency and control.",
          },
          {
            practice: "Submitting",
            fantasyPull: 5,
            actualPleasure: 2,
            description:
              "Letting the partner lead. Organizes acceptance and release of responsibility.",
          },
          {
            practice: "Romantic dominance",
            fantasyPull: 5,
            actualPleasure: 4,
            description:
              "Leading in a caring, protective way. Organizes reassurance and attraction.",
          },
          {
            practice: "Service submission",
            fantasyPull: 5,
            actualPleasure: 3,
            description:
              "Showing devotion by pleasing the partner. Organizes caretaking and meaning.",
          },
          {
            practice: "Worshipping partner",
            fantasyPull: 5,
            actualPleasure: 5,
            description:
              "Treating the partner as precious or ideal. Organizes devotion and admiration.",
          },
          {
            practice: "Being worshipped",
            fantasyPull: 6,
            actualPleasure: 4,
            description:
              "Being idealized and adored. Organizes approval and desirability confirmation.",
          },
          {
            practice: "Master–slave (consensual)",
            fantasyPull: 7,
            actualPleasure: 1,
            description: "Formalized hierarchy. Organizes identity and power structure.",
          },
          {
            practice: "Power exchange (24/7 or partial)",
            fantasyPull: 7,
            actualPleasure: 2,
            description: "Maintaining roles inside and outside sex. Organizes lifestyle identity.",
          },
        ],
      },
      {
        title: "Pain, Restraint & Edge",
        rows: [
          {
            practice: "Giving impact (spanking, etc.)",
            fantasyPull: 5,
            actualPleasure: 1,
            description: "Applying controlled physical sensation. Organizes expression of power.",
          },
          {
            practice: "Receiving impact",
            fantasyPull: 5,
            actualPleasure: 2,
            description: "Experiencing strong sensation. Organizes surrender and intensity.",
          },
          {
            practice: "Biting / scratching",
            fantasyPull: 4,
            actualPleasure: 2,
            description: "Primal physical expression. Organizes animalistic energy.",
          },
          {
            practice: "Choking / neck holding (light, consensual)",
            fantasyPull: 7,
            actualPleasure: 1,
            description:
              "Heightened intensity through trust and risk. Organizes surrender and thrill.",
          },
          {
            practice: "Restraining partner",
            fantasyPull: 6,
            actualPleasure: 1,
            description: "Limiting movement. Organizes control and dominance.",
          },
          {
            practice: "Being restrained",
            fantasyPull: 4,
            actualPleasure: 1,
            description: "Having movement limited. Organizes surrender and focus.",
          },
          {
            practice: "Erotic pain endurance",
            fantasyPull: 7,
            actualPleasure: 2,
            description: "Holding a strong sensation. Organizes challenge and resilience.",
          },
          {
            practice: "Shibari / erotic rope art",
            fantasyPull: 6,
            actualPleasure: 2,
            description: "Aesthetic and emotional restraint. Organizes beauty and surrender.",
          },
        ],
      },
      {
        title: "Erotic Attention, Voyeurism & Third-Party Themes",
        rows: [
          {
            practice: "Being watched by partner",
            fantasyPull: 5,
            actualPleasure: 3,
            description: "Being held in a partner’s desire. Organizes approval and being chosen.",
          },
          {
            practice: "Watching your partner",
            fantasyPull: 5,
            actualPleasure: 5,
            description: "Witnessing their arousal. Organizes empathy and connection.",
          },
          {
            practice: "Voyeurism (watching others)",
            fantasyPull: 5,
            actualPleasure: 4,
            description: "Observing from emotional distance. Organizes curiosity and fantasy.",
          },
          {
            practice: "Exhibitionism",
            fantasyPull: 7,
            actualPleasure: 2,
            description: "Being visible to others. Organizes approval and performance.",
          },
          {
            practice: "Public or semi-public play",
            fantasyPull: 7,
            actualPleasure: 1,
            description: "Risk of being discovered. Organizes thrill and taboo.",
          },
          {
            practice: "Public teasing",
            fantasyPull: 5,
            actualPleasure: 2,
            description: "Secret intimacy in public. Organizes anticipation and being chosen.",
          },
          {
            practice: "Being watched secretly by partner",
            fantasyPull: 5,
            actualPleasure: 1,
            description: "Being desired without performing. Organizes effortless approval.",
          },
          {
            practice: "Forced voyeurism fantasy",
            fantasyPull: 8,
            actualPleasure: 2,
            description: "Losing control over who sees you. Organizes exposure and powerlessness.",
          },
          {
            practice: "Cuckold (partner with others)",
            fantasyPull: 6,
            actualPleasure: 2,
            description:
              "Eroticized jealousy and loss of status. Organizes insecurity and surrender.",
          },
          {
            practice: "Hotwifing",
            fantasyPull: 6,
            actualPleasure: 1,
            description:
              "Sharing partner to feel pride and reflected desirability. Organizes status and approval.",
          },
          {
            practice: "Group sex / threesomes",
            fantasyPull: 8,
            actualPleasure: 1,
            description: "Multiple streams of desire. Organizes novelty and attention.",
          },
          {
            practice: "Anonymous encounter fantasy",
            fantasyPull: 7,
            actualPleasure: 3,
            description: "Being desired without being known. Organizes freedom from identity.",
          },
        ],
      },
      {
        title: "Fetish, Identity & Body-Focus",
        rows: [
          {
            practice: "Foot fetish",
            fantasyPull: 5,
            actualPleasure: 2,
            description: "Focus on a specific body part. Organizes symbolic attraction.",
          },
          {
            practice: "Hair fetish",
            fantasyPull: 3,
            actualPleasure: 2,
            description: "Arousal from hair. Organizes sensory fixation.",
          },
          {
            practice: "Breasts / nipple play",
            fantasyPull: 4,
            actualPleasure: 4,
            description: "Chest-focused stimulation. Organizes nurturance and pleasure.",
          },
          {
            practice: "Hands / legs / thighs",
            fantasyPull: 4,
            actualPleasure: 5,
            description: "Body-part focus. Organizes visual and tactile attraction.",
          },
          {
            practice: "Voice fetish",
            fantasyPull: 5,
            actualPleasure: 5,
            description: "Arousal from sound. Organizes emotional resonance.",
          },
          {
            practice: "Cross-dressing / gender play",
            fantasyPull: 5,
            actualPleasure: 1,
            description:
              "Wearing or exploring different gendered roles. Organizes identity exploration.",
          },
          {
            practice: "Lingerie / fetish wear",
            fantasyPull: 5,
            actualPleasure: 4,
            description: "Erotic clothing. Organizes display and identity.",
          },
          {
            practice: "Worshipping partner’s body",
            fantasyPull: 5,
            actualPleasure: 6,
            description: "Admiring the partner’s physical form. Organizes devotion.",
          },
        ],
      },
      {
        title: "Taboo, Fluids & Extreme Kink",
        rows: [
          {
            practice: "Cum play",
            fantasyPull: 5,
            actualPleasure: 2,
            description: "Focus on sexual fluids. Organizes taboo and intimacy.",
          },
          {
            practice: "Pee / golden shower",
            fantasyPull: 7,
            actualPleasure: 2,
            description: "Using urine as a taboo element. Organizes transgression.",
          },
          {
            practice: "Scat",
            fantasyPull: 7,
            actualPleasure: 3,
            description: "Using feces as erotic element. Organizes extreme taboo.",
          },
          {
            practice: "Breeding fantasy",
            fantasyPull: 5,
            actualPleasure: 3,
            description: "Imagining impregnation. Organizes fertility and legacy.",
          },
          {
            practice: "Pregnancy play",
            fantasyPull: 6,
            actualPleasure: 2,
            description: "Eroticizing pregnancy. Organizes nurture and taboo.",
          },
          {
            practice: "Lactation play",
            fantasyPull: 4,
            actualPleasure: 1,
            description: "Milk as erotic symbol. Organizes nurturance.",
          },
          {
            practice: "Object insertion",
            fantasyPull: 5,
            actualPleasure: 1,
            description: "Using non-sexual objects. Organizes novelty and taboo.",
          },
          {
            practice: "Food play",
            fantasyPull: 4,
            actualPleasure: 2,
            description: "Using food in erotic context. Organizes sensory transgression.",
          },
        ],
      },
      {
        title: "Technology & Distance",
        rows: [
          {
            practice: "Sexting",
            fantasyPull: 4,
            actualPleasure: 2,
            description: "Sending erotic messages. Organizes anticipation and desire.",
          },
          {
            practice: "Erotic voice / audio",
            fantasyPull: 4,
            actualPleasure: 4,
            description: "Hearing arousing speech. Organizes intimacy through sound.",
          },
          {
            practice: "Erotic photography / filming",
            fantasyPull: 5,
            actualPleasure: 1,
            description: "Recording intimacy. Organizes being seen and remembered.",
          },
          {
            practice: "Mutual video masturbation",
            fantasyPull: 4,
            actualPleasure: 1,
            description: "Remote shared arousal. Organizes connection across distance.",
          },
          {
            practice: "Long-distance sexual play",
            fantasyPull: 4,
            actualPleasure: 5,
            description: "Maintaining intimacy when apart. Organizes emotional continuity.",
          },
        ],
      },
      {
        title: "Ritual, Tantra & Conscious Sex",
        rows: [
          {
            practice: "Tantra / spiritual sexuality",
            fantasyPull: 6,
            actualPleasure: 6,
            description: "Presence-based intimacy. Organizes awareness and depth.",
          },
          {
            practice: "Sacred kink",
            fantasyPull: 7,
            actualPleasure: 4,
            description: "Ritualized erotic power. Organizes meaning and transformation.",
          },
          {
            practice: "Sensual rituals",
            fantasyPull: 5,
            actualPleasure: 7,
            description: "Structured, intentional intimacy. Organizes focus and connection.",
          },
          {
            practice: "Mirror sex",
            fantasyPull: 4,
            actualPleasure: 1,
            description: "Watching oneself and partner. Organizes self-awareness.",
          },
          {
            practice: "Mutual surrender experience",
            fantasyPull: 6,
            actualPleasure: 5,
            description: "Letting go together. Organizes acceptance and union.",
          },
          {
            practice: "Shadow work through sex",
            fantasyPull: 7,
            actualPleasure: 1,
            description: "Exploring shame or hidden parts. Organizes integration.",
          },
        ],
      },
    ],
  },
  "Analytical Sexualist": {
    introBlocks: [
      "<p>These scores <strong>do not define you as an individual</strong>. They are <strong>probability-based estimates derived from aggregated research and observed patterns across archetypes.</strong></p>",
      "<p>They <strong>reflect what is statistically more common, not what is fixed or deterministic for you individually.</strong> Every person is unique, and real-world preferences are shaped by personal experience, context, development, and the combination of multiple archetypes within you.</p>",
      "<p>This means your actual desires, boundaries, and experiences may align with, differ from, or evolve beyond these patterns — sometimes significantly.</p>",
      "<p>We present two separate metrics on a 10-point scale:</p>",
      "<ul><li><strong>Fantasy Pull:</strong> how strongly a theme tends to appear in imagination, curiosity, or arousal</li><li><strong>Lived Pleasure:</strong> how likely the same theme is to feel grounding, pleasurable, and genuinely good when experienced in real life</li></ul>",
      "<p><strong>Fantasy Pull:</strong></p>",
      "<ul><li><strong>High</strong> (7–10): More likely to feel mentally engaging, arousing, or intriguing in imagination.</li><li><strong>Low</strong> (1–4): Less likely to capture attention or appear in imagination arousing.</li></ul>",
      "<p><strong>Actual Pleasure:</strong></p>",
      "<ul><li><strong>High</strong> (7–10): More likely to feel physically and/or emotionally satisfying in real-life experience (given the right context, such as trust and safety).</li><li><strong>Low</strong> (1–4): Less likely to feel rewarding, pleasurable or to resonate strongly in practice</li></ul>",
      "<p><strong>How to read combinations of scores</strong></p>",
      "<p>Because Fantasy Pull and Lived Pleasure are independent, the relationship between them matters. Looking at both together helps you understand how a theme tends to show up in your mind vs. in real experience.</p>",
      "<p><strong>Low Fantasy + Low Pleasure</strong> → Generally not relevant<br />This suggests a theme is neither mentally engaging nor particularly rewarding in practice. Typically something to deprioritize, unless curiosity emerges naturally over time.</p>",
      "<p><strong>Low Fantasy + High Pleasure</strong> → Better in reality than in imagination</p>",
      "<p>You may not think about it much, but when experienced, it can feel surprisingly good or fulfilling. Often worth gently exploring in real-life contexts, as these areas can reveal unexpected compatibility.</p>",
      "<p><strong>High Fantasy + Low Pleasure</strong> → Stronger in imagination than in reality<br />There is a strong mental or symbolic attraction, but less consistent satisfaction in practice. Calls for conscious exploration and adjustment — refining context, pace, or boundaries — or keeping parts of it in fantasy where it feels most aligned.</p>",
      "<p><strong>High Fantasy + High Pleasure</strong> → Alignment between mind and experience<br />What feels exciting in imagination is also likely to feel good in reality. These are areas to lean into and deepen, often representing natural sources of fulfillment and ease.</p>",
    ],
    groups: [
      {
        title: "Core Relational & Embodied",
        rows: [
          {
            practice: "Romantic lovemaking",
            fantasyPull: 4,
            actualPleasure: 4,
            description:
              "Sex centered on affection, tenderness, and feeling emotionally chosen. Organizes attachment, predictability, and alignment.",
          },
          {
            practice: "Slow build / extended foreplay",
            fantasyPull: 4,
            actualPleasure: 5,
            description:
              "Gradual arousal through time, touch, and anticipation. Organizes nervous-system regulation and clarity.",
          },
          {
            practice: "Passionate quickies",
            fantasyPull: 4,
            actualPleasure: 3,
            description:
              "Fast, urgent sex driven by impulse. Organizes competence, release, and optimization.",
          },
          {
            practice: "Morning sex",
            fantasyPull: 3,
            actualPleasure: 3,
            description:
              "Gentle or energized intimacy after waking. Organizes comfort, connection, and bodily openness.",
          },
          {
            practice: "Sleeping / wake-up sex",
            fantasyPull: 5,
            actualPleasure: 5,
            description:
              "Intimacy while drifting in or out of sleep. Organizes transparency and softness.",
          },
          {
            practice: "After-argument / makeup sex",
            fantasyPull: 5,
            actualPleasure: 3,
            description: "Sex after conflict. Organizes emotional repair and tension discharge.",
          },
          {
            practice: "Romantic aftercare",
            fantasyPull: 5,
            actualPleasure: 4,
            description:
              "Cuddling, closeness, and reassurance after sex. Organizes emotional completion and predictability.",
          },
          {
            practice: "Emotional vulnerability during sex",
            fantasyPull: 3,
            actualPleasure: 4,
            description:
              "Sharing feelings or being emotionally open while intimate. Organizes being seen and accepted.",
          },
          {
            practice: "Crying or emotional release",
            fantasyPull: 3,
            actualPleasure: 5,
            description:
              "Letting emotions surface during intimacy. Organizes catharsis and relief.",
          },
          {
            practice: "Emotional healing sex",
            fantasyPull: 4,
            actualPleasure: 6,
            description:
              "Using intimacy to soothe or repair emotionally. Organizes nervous-system regulation.",
          },
          {
            practice: "Spiritual merging / oneness",
            fantasyPull: 6,
            actualPleasure: 6,
            description:
              "Experiencing sex as a transcendent union. Organizes meaning and connection beyond self.",
          },
        ],
      },
      {
        title: "Touch, Sensory & Body-Based",
        rows: [
          {
            practice: "Sensual massage",
            fantasyPull: 4,
            actualPleasure: 4,
            description:
              "Slow, attentive touch meant to relax and awaken sensation. Organizes predictability and body awareness.",
          },
          {
            practice: "Erotic massage exchange",
            fantasyPull: 4,
            actualPleasure: 5,
            description:
              "Partners take turns giving sensual touch. Organizes mutual giving and receiving.",
          },
          {
            practice: "Sensory play",
            fantasyPull: 6,
            actualPleasure: 5,
            description:
              "Using textures, sounds, or sensations to heighten awareness. Organizes curiosity and bodily focus.",
          },
          {
            practice: "Sensory deprivation / blindfolds",
            fantasyPull: 6,
            actualPleasure: 6,
            description:
              "Limiting senses to intensify others. Organizes surrender and concentration.",
          },
          {
            practice: "Temperature play",
            fantasyPull: 6,
            actualPleasure: 7,
            description:
              "Using warmth or coolness to stimulate nerves. Organizes optimization and alertness.",
          },
          {
            practice: "Slow synchronized breathing",
            fantasyPull: 4,
            actualPleasure: 3,
            description: "Breathing together. Organizes co-regulation and calm.",
          },
          {
            practice: "Mutual tantric gaze",
            fantasyPull: 5,
            actualPleasure: 4,
            description: "Holding eye contact for extended time. Organizes emotional presence.",
          },
          {
            practice: "Scent / pheromone play",
            fantasyPull: 5,
            actualPleasure: 5,
            description: "Using smell as an arousal cue. Organizes primal attraction.",
          },
          {
            practice: "Multi-sensory immersion",
            fantasyPull: 6,
            actualPleasure: 4,
            description:
              "Combining sound, touch, smell, and atmosphere. Organizes full-body engagement.",
          },
        ],
      },
      {
        title: "Giving vs Receiving Stimulation",
        rows: [
          {
            practice: "Giving oral",
            fantasyPull: 3,
            actualPleasure: 3,
            description: "Pleasing a partner with a mouth. Organizes caretaking and attentiveness.",
          },
          {
            practice: "Receiving oral",
            fantasyPull: 3,
            actualPleasure: 4,
            description:
              "Being pleasured by a partner’s mouth. Organizes feeling wanted and focused on.",
          },
          {
            practice: "Giving manual stimulation",
            fantasyPull: 3,
            actualPleasure: 2,
            description: "Pleasing a partner with hands. Organizes giving and responsiveness.",
          },
          {
            practice: "Receiving manual stimulation",
            fantasyPull: 2,
            actualPleasure: 3,
            description: "Being pleasured by touch. Organizes being held in erotic attention.",
          },
          {
            practice: "Mutual masturbation",
            fantasyPull: 4,
            actualPleasure: 3,
            description:
              "Both partners pleasure themselves together. Organizes shared presence with autonomy.",
          },
          {
            practice: "Masturbating in front of partner",
            fantasyPull: 5,
            actualPleasure: 3,
            description:
              "Self-pleasure while being watched. Organizes being desired without effort.",
          },
          {
            practice: "Using toys on partner",
            fantasyPull: 4,
            actualPleasure: 4,
            description: "Enhancing their sensation. Organizes caretaking and curiosity.",
          },
          {
            practice: "Having toys used on you",
            fantasyPull: 4,
            actualPleasure: 2,
            description: "Receiving intensified stimulation. Organizes surrender and focus.",
          },
        ],
      },
      {
        title: "Penetration & Body Opening",
        rows: [
          {
            practice: "Penetrating partner",
            fantasyPull: 2,
            actualPleasure: 2,
            description: "Being the active, initiating body. Organizes agency and movement.",
          },
          {
            practice: "Being penetrated",
            fantasyPull: 2,
            actualPleasure: 3,
            description:
              "Allowing the partner inside one’s body. Organizes surrender and openness.",
          },
          {
            practice: "Pegging",
            fantasyPull: 8,
            actualPleasure: 5,
            description:
              "Being penetrated by a partner using a device. Organizes role-reversal and clarity.",
          },
          {
            practice: "Anal play (giving)",
            fantasyPull: 8,
            actualPleasure: 6,
            description: "Stimulating a partner anally. Organizes control and taboo.",
          },
          {
            practice: "Anal play (receiving)",
            fantasyPull: 8,
            actualPleasure: 4,
            description: "Being anally stimulated. Organizes transparency and surrender.",
          },
          {
            practice: "Double-penetration fantasy",
            fantasyPull: 10,
            actualPleasure: 8,
            description:
              "Imagining intense bodily overwhelm. Organizes extremity and fantasy of being overtaken.",
          },
        ],
      },
      {
        title: "Power & Role Dynamics",
        rows: [
          {
            practice: "Dominating",
            fantasyPull: 5,
            actualPleasure: 3,
            description: "Taking charge and directing the encounter. Organizes agency and control.",
          },
          {
            practice: "Submitting",
            fantasyPull: 6,
            actualPleasure: 4,
            description:
              "Letting the partner lead. Organizes clarity and release of responsibility.",
          },
          {
            practice: "Romantic dominance",
            fantasyPull: 6,
            actualPleasure: 3,
            description:
              "Leading in a caring, protective way. Organizes predictability and attraction.",
          },
          {
            practice: "Service submission",
            fantasyPull: 7,
            actualPleasure: 4,
            description:
              "Showing devotion by pleasing the partner. Organizes caretaking and meaning.",
          },
          {
            practice: "Worshipping partner",
            fantasyPull: 6,
            actualPleasure: 5,
            description:
              "Treating the partner as precious or ideal. Organizes devotion and admiration.",
          },
          {
            practice: "Being worshipped",
            fantasyPull: 5,
            actualPleasure: 4,
            description: "Being idealized and adored. Organizes validation and self-worth.",
          },
          {
            practice: "Master–slave (consensual)",
            fantasyPull: 10,
            actualPleasure: 5,
            description: "Formalized hierarchy. Organizes identity and structure structure.",
          },
          {
            practice: "Power exchange (24/7 or partial)",
            fantasyPull: 10,
            actualPleasure: 6,
            description: "Maintaining roles inside and outside sex. Organizes lifestyle identity.",
          },
        ],
      },
      {
        title: "Pain, Restraint & Edge",
        rows: [
          {
            practice: "Giving impact (spanking, etc.)",
            fantasyPull: 8,
            actualPleasure: 5,
            description:
              "Applying controlled physical sensation. Organizes expression of structure.",
          },
          {
            practice: "Receiving impact",
            fantasyPull: 8,
            actualPleasure: 6,
            description: "Experiencing strong sensation. Organizes surrender and intensity.",
          },
          {
            practice: "Biting / scratching",
            fantasyPull: 5,
            actualPleasure: 4,
            description: "Primal physical expression. Organizes animalistic energy.",
          },
          {
            practice: "Choking / neck holding (light, consensual)",
            fantasyPull: 10,
            actualPleasure: 6,
            description:
              "Heightened intensity through trust and risk. Organizes surrender and thrill.",
          },
          {
            practice: "Restraining partner",
            fantasyPull: 8,
            actualPleasure: 4,
            description: "Limiting movement. Organizes control and dominance.",
          },
          {
            practice: "Being restrained",
            fantasyPull: 9,
            actualPleasure: 5,
            description: "Having movement limited. Organizes surrender and focus.",
          },
          {
            practice: "Erotic pain endurance",
            fantasyPull: 10,
            actualPleasure: 7,
            description: "Holding a strong sensation. Organizes challenge and resilience.",
          },
          {
            practice: "Shibari / erotic rope art",
            fantasyPull: 7,
            actualPleasure: 5,
            description: "Aesthetic and emotional restraint. Organizes beauty and surrender.",
          },
        ],
      },
      {
        title: "Erotic Attention, Voyeurism & Third-Party Themes",
        rows: [
          {
            practice: "Being watched by partner",
            fantasyPull: 6,
            actualPleasure: 4,
            description: "Being held in a partner’s desire. Organizes validation and being chosen.",
          },
          {
            practice: "Watching your partner",
            fantasyPull: 6,
            actualPleasure: 5,
            description: "Witnessing their arousal. Organizes empathy and connection.",
          },
          {
            practice: "Voyeurism (watching others)",
            fantasyPull: 8,
            actualPleasure: 6,
            description: "Observing from emotional distance. Organizes curiosity and fantasy.",
          },
          {
            practice: "Exhibitionism",
            fantasyPull: 10,
            actualPleasure: 7,
            description: "Being visible to others. Organizes validation and performance.",
          },
          {
            practice: "Public or semi-public play",
            fantasyPull: 10,
            actualPleasure: 6,
            description: "Risk of being discovered. Organizes thrill and taboo.",
          },
          {
            practice: "Public teasing",
            fantasyPull: 8,
            actualPleasure: 7,
            description: "Secret intimacy in public. Organizes anticipation and alignment.",
          },
          {
            practice: "Being watched secretly by partner",
            fantasyPull: 8,
            actualPleasure: 5,
            description: "Being desired without performing. Organizes effortless validation.",
          },
          {
            practice: "Forced voyeurism fantasy",
            fantasyPull: 9,
            actualPleasure: 7,
            description:
              "Losing control over who sees you. Organizes exposure and structurelessness.",
          },
          {
            practice: "Cuckold (partner with others)",
            fantasyPull: 9,
            actualPleasure: 6,
            description:
              "Eroticized jealousy and loss of status. Organizes insecurity and surrender.",
          },
          {
            practice: "Hotwifing",
            fantasyPull: 9,
            actualPleasure: 8,
            description:
              "Sharing partner to feel pride and reflected desirability. Organizes status and validation.",
          },
          {
            practice: "Group sex / threesomes",
            fantasyPull: 10,
            actualPleasure: 9,
            description: "Multiple streams of desire. Organizes optimization and attention.",
          },
          {
            practice: "Anonymous encounter fantasy",
            fantasyPull: 10,
            actualPleasure: 8,
            description: "Being desired without being known. Organizes freedom from identity.",
          },
        ],
      },
      {
        title: "Fetish, Identity & Body-Focus",
        rows: [
          {
            practice: "Foot fetish",
            fantasyPull: 6,
            actualPleasure: 5,
            description: "Focus on a specific body part. Organizes symbolic attraction.",
          },
          {
            practice: "Hair fetish",
            fantasyPull: 4,
            actualPleasure: 3,
            description: "Arousal from hair. Organizes sensory fixation.",
          },
          {
            practice: "Breasts / nipple play",
            fantasyPull: 3,
            actualPleasure: 3,
            description: "Chest-focused stimulation. Organizes nurturance and pleasure.",
          },
          {
            practice: "Hands / legs / thighs",
            fantasyPull: 3,
            actualPleasure: 4,
            description: "Body-part focus. Organizes visual and tactile attraction.",
          },
          {
            practice: "Voice fetish",
            fantasyPull: 5,
            actualPleasure: 5,
            description: "Arousal from sound. Organizes emotional resonance.",
          },
          {
            practice: "Cross-dressing / gender play",
            fantasyPull: 8,
            actualPleasure: 5,
            description:
              "Wearing or exploring different gendered roles. Organizes identity exploration.",
          },
          {
            practice: "Lingerie / fetish wear",
            fantasyPull: 6,
            actualPleasure: 6,
            description: "Erotic clothing. Organizes display and identity.",
          },
          {
            practice: "Worshipping partner’s body",
            fantasyPull: 5,
            actualPleasure: 6,
            description: "Admiring the partner’s physical form. Organizes devotion.",
          },
        ],
      },
      {
        title: "Taboo, Fluids & Extreme Kink",
        rows: [
          {
            practice: "Cum play",
            fantasyPull: 8,
            actualPleasure: 6,
            description: "Focus on sexual fluids. Organizes taboo and intimacy.",
          },
          {
            practice: "Pee / golden shower",
            fantasyPull: 10,
            actualPleasure: 7,
            description: "Using urine as a taboo element. Organizes transgression.",
          },
          {
            practice: "Scat",
            fantasyPull: 10,
            actualPleasure: 8,
            description: "Using feces as erotic element. Organizes extreme taboo.",
          },
          {
            practice: "Breeding fantasy",
            fantasyPull: 8,
            actualPleasure: 7,
            description: "Imagining impregnation. Organizes fertility and legacy.",
          },
          {
            practice: "Pregnancy play",
            fantasyPull: 9,
            actualPleasure: 6,
            description: "Eroticizing pregnancy. Organizes nurture and taboo.",
          },
          {
            practice: "Lactation play",
            fantasyPull: 7,
            actualPleasure: 6,
            description: "Milk as erotic symbol. Organizes nurturance.",
          },
          {
            practice: "Object insertion",
            fantasyPull: 8,
            actualPleasure: 5,
            description: "Using non-sexual objects. Organizes optimization and taboo.",
          },
          {
            practice: "Food play",
            fantasyPull: 5,
            actualPleasure: 4,
            description: "Using food in erotic context. Organizes sensory transgression.",
          },
        ],
      },
      {
        title: "Technology & Distance",
        rows: [
          {
            practice: "Sexting",
            fantasyPull: 5,
            actualPleasure: 4,
            description: "Sending erotic messages. Organizes anticipation and desire.",
          },
          {
            practice: "Erotic voice / audio",
            fantasyPull: 3,
            actualPleasure: 3,
            description: "Hearing arousing speech. Organizes intimacy through sound.",
          },
          {
            practice: "Erotic photography / filming",
            fantasyPull: 8,
            actualPleasure: 5,
            description: "Recording intimacy. Organizes being seen and remembered.",
          },
          {
            practice: "Mutual video masturbation",
            fantasyPull: 5,
            actualPleasure: 3,
            description: "Remote shared arousal. Organizes connection across distance.",
          },
          {
            practice: "Long-distance sexual play",
            fantasyPull: 3,
            actualPleasure: 4,
            description: "Maintaining intimacy when apart. Organizes emotional continuity.",
          },
        ],
      },
      {
        title: "Ritual, Tantra & Conscious Sex",
        rows: [
          {
            practice: "Tantra / spiritual sexuality",
            fantasyPull: 6,
            actualPleasure: 5,
            description: "Presence-based intimacy. Organizes awareness and depth.",
          },
          {
            practice: "Sacred kink",
            fantasyPull: 7,
            actualPleasure: 5,
            description: "Ritualized erotic power. Organizes meaning and transformation.",
          },
          {
            practice: "Sensual rituals",
            fantasyPull: 4,
            actualPleasure: 4,
            description: "Structured, intentional intimacy. Organizes focus and connection.",
          },
          {
            practice: "Mirror sex",
            fantasyPull: 5,
            actualPleasure: 3,
            description: "Watching oneself and partner. Organizes self-awareness.",
          },
          {
            practice: "Mutual surrender experience",
            fantasyPull: 6,
            actualPleasure: 6,
            description: "Letting go together. Organizes clarity and union.",
          },
          {
            practice: "Shadow work through sex",
            fantasyPull: 7,
            actualPleasure: 3,
            description: "Exploring shame or hidden parts. Organizes integration.",
          },
        ],
      },
    ],
  },
  "Quiet Withdrawer": {
    introBlocks: [
      "<p>These scores <strong>do not define you as an individual</strong>. They are <strong>probability-based estimates derived from aggregated research and observed patterns across archetypes.</strong></p>",
      "<p>They <strong>reflect what is statistically more common, not what is fixed or deterministic for you individually.</strong> Every person is unique, and real-world preferences are shaped by personal experience, context, development, and the combination of multiple archetypes within you.</p>",
      "<p>This means your actual desires, boundaries, and experiences may align with, differ from, or evolve beyond these patterns — sometimes significantly.</p>",
      "<p>We present two separate metrics on a 10-point scale:</p>",
      "<ul><li><strong>Fantasy Pull:</strong> how strongly a theme tends to appear in imagination, curiosity, or arousal</li><li><strong>Lived Pleasure:</strong> how likely the same theme is to feel grounding, pleasurable, and genuinely good when experienced in real life</li></ul>",
      "<p><strong>Fantasy Pull:</strong></p>",
      "<ul><li><strong>High</strong> (7–10): More likely to feel mentally engaging, arousing, or intriguing in imagination.</li><li><strong>Low</strong> (1–4): Less likely to capture attention or appear in imagination arousing.</li></ul>",
      "<p><strong>Actual Pleasure:</strong></p>",
      "<ul><li><strong>High</strong> (7–10): More likely to feel physically and/or emotionally satisfying in real-life experience (given the right context, such as trust and safety).</li><li><strong>Low</strong> (1–4): Less likely to feel rewarding, pleasurable or to resonate strongly in practice</li></ul>",
      "<p><strong>How to read combinations of scores</strong></p>",
      "<p>Because Fantasy Pull and Lived Pleasure are independent, the relationship between them matters. Looking at both together helps you understand how a theme tends to show up in your mind vs. in real experience.</p>",
      "<p><strong>Low Fantasy + Low Pleasure</strong> → Generally not relevant<br />This suggests a theme is neither mentally engaging nor particularly rewarding in practice. Typically something to deprioritize, unless curiosity emerges naturally over time.</p>",
      "<p><strong>Low Fantasy + High Pleasure</strong> → Better in reality than in imagination</p>",
      "<p>You may not think about it much, but when experienced, it can feel surprisingly good or fulfilling. Often worth gently exploring in real-life contexts, as these areas can reveal unexpected compatibility.</p>",
      "<p><strong>High Fantasy + Low Pleasure</strong> → Stronger in imagination than in reality<br />There is a strong mental or symbolic attraction, but less consistent satisfaction in practice. Calls for conscious exploration and adjustment — refining context, pace, or boundaries — or keeping parts of it in fantasy where it feels most aligned.</p>",
      "<p><strong>High Fantasy + High Pleasure</strong> → Alignment between mind and experience<br />What feels exciting in imagination is also likely to feel good in reality. These are areas to lean into and deepen, often representing natural sources of fulfillment and ease.</p>",
    ],
    groups: [
      {
        title: "Core Relational & Embodied",
        rows: [
          {
            practice: "Romantic lovemaking",
            fantasyPull: 4,
            actualPleasure: 4,
            description:
              "Sex centered on affection, tenderness, and feeling emotionally chosen. Organizes attachment, low pressure, and quiet closeness.",
          },
          {
            practice: "Slow build / extended foreplay",
            fantasyPull: 4,
            actualPleasure: 5,
            description:
              "Gradual arousal through time, touch, and anticipation. Organizes nervous-system regulation and time and consistency.",
          },
          {
            practice: "Passionate quickies",
            fantasyPull: 3,
            actualPleasure: 3,
            description:
              "Fast, urgent sex driven by impulse. Organizes calm, release, and predictability.",
          },
          {
            practice: "Morning sex",
            fantasyPull: 3,
            actualPleasure: 4,
            description:
              "Gentle or energized intimacy after waking. Organizes comfort, connection, and bodily openness.",
          },
          {
            practice: "Sleeping / wake-up sex",
            fantasyPull: 4,
            actualPleasure: 3,
            description:
              "Intimacy while drifting in or out of sleep. Organizes gentle openness and softness.",
          },
          {
            practice: "After-argument / makeup sex",
            fantasyPull: 4,
            actualPleasure: 1,
            description: "Sex after conflict. Organizes emotional repair and tension discharge.",
          },
          {
            practice: "Romantic aftercare",
            fantasyPull: 5,
            actualPleasure: 4,
            description:
              "Cuddling, closeness, and reassurance after sex. Organizes emotional completion and low pressure.",
          },
          {
            practice: "Emotional vulnerability during sex",
            fantasyPull: 4,
            actualPleasure: 2,
            description:
              "Sharing feelings or being emotionally open while intimate. Organizes being seen and accepted.",
          },
          {
            practice: "Crying or emotional release",
            fantasyPull: 5,
            actualPleasure: 2,
            description:
              "Letting emotions surface during intimacy. Organizes catharsis and relief.",
          },
          {
            practice: "Emotional healing sex",
            fantasyPull: 3,
            actualPleasure: 2,
            description:
              "Using intimacy to soothe or repair emotionally. Organizes nervous-system regulation.",
          },
          {
            practice: "Spiritual merging / oneness",
            fantasyPull: 5,
            actualPleasure: 3,
            description:
              "Experiencing sex as a transcendent union. Organizes meaning and connection beyond self.",
          },
        ],
      },
      {
        title: "Touch, Sensory & Body-Based",
        rows: [
          {
            practice: "Sensual massage",
            fantasyPull: 4,
            actualPleasure: 4,
            description:
              "Slow, attentive touch meant to relax and awaken sensation. Organizes low pressure and body awareness.",
          },
          {
            practice: "Erotic massage exchange",
            fantasyPull: 4,
            actualPleasure: 5,
            description:
              "Partners take turns giving sensual touch. Organizes mutual giving and receiving.",
          },
          {
            practice: "Sensory play",
            fantasyPull: 4,
            actualPleasure: 3,
            description:
              "Using textures, sounds, or sensations to heighten awareness. Organizes curiosity and bodily focus.",
          },
          {
            practice: "Sensory deprivation / blindfolds",
            fantasyPull: 4,
            actualPleasure: 1,
            description:
              "Limiting senses to intensify others. Organizes surrender and concentration.",
          },
          {
            practice: "Temperature play",
            fantasyPull: 4,
            actualPleasure: 2,
            description:
              "Using warmth or coolness to stimulate nerves. Organizes predictability and alertness.",
          },
          {
            practice: "Slow synchronized breathing",
            fantasyPull: 3,
            actualPleasure: 4,
            description: "Breathing together. Organizes co-regulation and calm.",
          },
          {
            practice: "Mutual tantric gaze",
            fantasyPull: 3,
            actualPleasure: 3,
            description: "Holding eye contact for extended time. Organizes emotional presence.",
          },
          {
            practice: "Scent / pheromone play",
            fantasyPull: 3,
            actualPleasure: 5,
            description: "Using smell as an arousal cue. Organizes primal attraction.",
          },
          {
            practice: "Multi-sensory immersion",
            fantasyPull: 5,
            actualPleasure: 4,
            description:
              "Combining sound, touch, smell, and atmosphere. Organizes full-body engagement.",
          },
        ],
      },
      {
        title: "Giving vs Receiving Stimulation",
        rows: [
          {
            practice: "Giving oral",
            fantasyPull: 3,
            actualPleasure: 3,
            description: "Pleasing a partner with a mouth. Organizes caretaking and attentiveness.",
          },
          {
            practice: "Receiving oral",
            fantasyPull: 3,
            actualPleasure: 2,
            description:
              "Being pleasured by a partner’s mouth. Organizes feeling wanted and focused on.",
          },
          {
            practice: "Giving manual stimulation",
            fantasyPull: 3,
            actualPleasure: 4,
            description: "Pleasing a partner with hands. Organizes giving and responsiveness.",
          },
          {
            practice: "Receiving manual stimulation",
            fantasyPull: 4,
            actualPleasure: 2,
            description: "Being pleasured by touch. Organizes being held in erotic attention.",
          },
          {
            practice: "Mutual masturbation",
            fantasyPull: 2,
            actualPleasure: 2,
            description:
              "Both partners pleasure themselves together. Organizes shared presence with autonomy.",
          },
          {
            practice: "Masturbating in front of partner",
            fantasyPull: 3,
            actualPleasure: 1,
            description:
              "Self-pleasure while being watched. Organizes being desired without effort.",
          },
          {
            practice: "Using toys on partner",
            fantasyPull: 2,
            actualPleasure: 1,
            description: "Enhancing their sensation. Organizes caretaking and curiosity.",
          },
          {
            practice: "Having toys used on you",
            fantasyPull: 2,
            actualPleasure: 3,
            description: "Receiving intensified stimulation. Organizes surrender and focus.",
          },
        ],
      },
      {
        title: "Penetration & Body Opening",
        rows: [
          {
            practice: "Penetrating partner",
            fantasyPull: 2,
            actualPleasure: 2,
            description: "Being the active, initiating body. Organizes agency and movement.",
          },
          {
            practice: "Being penetrated",
            fantasyPull: 2,
            actualPleasure: 1,
            description:
              "Allowing the partner inside one’s body. Organizes surrender and openness.",
          },
          {
            practice: "Pegging",
            fantasyPull: 4,
            actualPleasure: 1,
            description:
              "Being penetrated by a partner using a device. Organizes role-reversal and time and consistency.",
          },
          {
            practice: "Anal play (giving)",
            fantasyPull: 4,
            actualPleasure: 2,
            description: "Stimulating a partner anally. Organizes control and taboo.",
          },
          {
            practice: "Anal play (receiving)",
            fantasyPull: 3,
            actualPleasure: 1,
            description: "Being anally stimulated. Organizes gentle openness and surrender.",
          },
          {
            practice: "Double-penetration fantasy",
            fantasyPull: 5,
            actualPleasure: 1,
            description:
              "Imagining intense bodily overwhelm. Organizes extremity and fantasy of being overtaken.",
          },
        ],
      },
      {
        title: "Power & Role Dynamics",
        rows: [
          {
            practice: "Dominating",
            fantasyPull: 3,
            actualPleasure: 1,
            description: "Taking charge and directing the encounter. Organizes agency and control.",
          },
          {
            practice: "Submitting",
            fantasyPull: 4,
            actualPleasure: 1,
            description:
              "Letting the partner lead. Organizes time and consistency and release of responsibility.",
          },
          {
            practice: "Romantic dominance",
            fantasyPull: 4,
            actualPleasure: 2,
            description:
              "Leading in a caring, protective way. Organizes low pressure and attraction.",
          },
          {
            practice: "Service submission",
            fantasyPull: 3,
            actualPleasure: 2,
            description:
              "Showing devotion by pleasing the partner. Organizes caretaking and meaning.",
          },
          {
            practice: "Worshipping partner",
            fantasyPull: 4,
            actualPleasure: 3,
            description:
              "Treating the partner as precious or ideal. Organizes devotion and admiration.",
          },
          {
            practice: "Being worshipped",
            fantasyPull: 4,
            actualPleasure: 4,
            description: "Being idealized and adored. Organizes low scrutiny and self-worth.",
          },
          {
            practice: "Master–slave (consensual)",
            fantasyPull: 5,
            actualPleasure: 1,
            description: "Formalized hierarchy. Organizes identity and safety structure.",
          },
          {
            practice: "Power exchange (24/7 or partial)",
            fantasyPull: 5,
            actualPleasure: 2,
            description: "Maintaining roles inside and outside sex. Organizes lifestyle identity.",
          },
        ],
      },
      {
        title: "Pain, Restraint & Edge",
        rows: [
          {
            practice: "Giving impact (spanking, etc.)",
            fantasyPull: 4,
            actualPleasure: 1,
            description: "Applying controlled physical sensation. Organizes expression of safety.",
          },
          {
            practice: "Receiving impact",
            fantasyPull: 4,
            actualPleasure: 2,
            description: "Experiencing strong sensation. Organizes surrender and regulation.",
          },
          {
            practice: "Biting / scratching",
            fantasyPull: 3,
            actualPleasure: 1,
            description: "Primal physical expression. Organizes animalistic energy.",
          },
          {
            practice: "Choking / neck holding (light, consensual)",
            fantasyPull: 5,
            actualPleasure: 1,
            description:
              "Heightened intensity through trust and risk. Organizes surrender and thrill.",
          },
          {
            practice: "Restraining partner",
            fantasyPull: 3,
            actualPleasure: 2,
            description: "Limiting movement. Organizes control and dominance.",
          },
          {
            practice: "Being restrained",
            fantasyPull: 5,
            actualPleasure: 2,
            description: "Having movement limited. Organizes surrender and focus.",
          },
          {
            practice: "Erotic pain endurance",
            fantasyPull: 6,
            actualPleasure: 1,
            description: "Holding a strong sensation. Organizes challenge and resilience.",
          },
          {
            practice: "Shibari / erotic rope art",
            fantasyPull: 4,
            actualPleasure: 3,
            description: "Aesthetic and emotional restraint. Organizes beauty and surrender.",
          },
        ],
      },
      {
        title: "Erotic Attention, Voyeurism & Third-Party Themes",
        rows: [
          {
            practice: "Being watched by partner",
            fantasyPull: 4,
            actualPleasure: 1,
            description:
              "Being held in a partner’s desire. Organizes low scrutiny and being chosen.",
          },
          {
            practice: "Watching your partner",
            fantasyPull: 4,
            actualPleasure: 3,
            description: "Witnessing their arousal. Organizes empathy and connection.",
          },
          {
            practice: "Voyeurism (watching others)",
            fantasyPull: 4,
            actualPleasure: 2,
            description: "Observing from emotional distance. Organizes curiosity and fantasy.",
          },
          {
            practice: "Exhibitionism",
            fantasyPull: 5,
            actualPleasure: 1,
            description: "Being visible to others. Organizes low scrutiny and performance.",
          },
          {
            practice: "Public or semi-public play",
            fantasyPull: 5,
            actualPleasure: 2,
            description: "Risk of being discovered. Organizes thrill and taboo.",
          },
          {
            practice: "Public teasing",
            fantasyPull: 3,
            actualPleasure: 1,
            description: "Secret intimacy in public. Organizes anticipation and quiet closeness.",
          },
          {
            practice: "Being watched secretly by partner",
            fantasyPull: 3,
            actualPleasure: 2,
            description: "Being desired without performing. Organizes effortless low scrutiny.",
          },
          {
            practice: "Forced voyeurism fantasy",
            fantasyPull: 6,
            actualPleasure: 1,
            description: "Losing control over who sees you. Organizes exposure and safetylessness.",
          },
          {
            practice: "Cuckold (partner with others)",
            fantasyPull: 6,
            actualPleasure: 2,
            description:
              "Eroticized jealousy and loss of status. Organizes insecurity and surrender.",
          },
          {
            practice: "Hotwifing",
            fantasyPull: 5,
            actualPleasure: 3,
            description:
              "Sharing partner to feel pride and reflected desirability. Organizes status and low scrutiny.",
          },
          {
            practice: "Group sex / threesomes",
            fantasyPull: 7,
            actualPleasure: 1,
            description: "Multiple streams of desire. Organizes predictability and attention.",
          },
          {
            practice: "Anonymous encounter fantasy",
            fantasyPull: 3,
            actualPleasure: 3,
            description: "Being desired without being known. Organizes freedom from identity.",
          },
        ],
      },
      {
        title: "Fetish, Identity & Body-Focus",
        rows: [
          {
            practice: "Foot fetish",
            fantasyPull: 4,
            actualPleasure: 1,
            description: "Focus on a specific body part. Organizes symbolic attraction.",
          },
          {
            practice: "Hair fetish",
            fantasyPull: 3,
            actualPleasure: 2,
            description: "Arousal from hair. Organizes sensory fixation.",
          },
          {
            practice: "Breasts / nipple play",
            fantasyPull: 3,
            actualPleasure: 1,
            description: "Chest-focused stimulation. Organizes nurturance and pleasure.",
          },
          {
            practice: "Hands / legs / thighs",
            fantasyPull: 3,
            actualPleasure: 3,
            description: "Body-part focus. Organizes visual and tactile attraction.",
          },
          {
            practice: "Voice fetish",
            fantasyPull: 4,
            actualPleasure: 4,
            description: "Arousal from sound. Organizes emotional resonance.",
          },
          {
            practice: "Cross-dressing / gender play",
            fantasyPull: 5,
            actualPleasure: 1,
            description:
              "Wearing or exploring different gendered roles. Organizes identity exploration.",
          },
          {
            practice: "Lingerie / fetish wear",
            fantasyPull: 4,
            actualPleasure: 2,
            description: "Erotic clothing. Organizes display and identity.",
          },
          {
            practice: "Worshipping partner’s body",
            fantasyPull: 4,
            actualPleasure: 5,
            description: "Admiring the partner’s physical form. Organizes devotion.",
          },
        ],
      },
      {
        title: "Taboo, Fluids & Extreme Kink",
        rows: [
          {
            practice: "Cum play",
            fantasyPull: 4,
            actualPleasure: 1,
            description: "Focus on sexual fluids. Organizes taboo and intimacy.",
          },
          {
            practice: "Pee / golden shower",
            fantasyPull: 5,
            actualPleasure: 1,
            description: "Using urine as a taboo element. Organizes transgression.",
          },
          {
            practice: "Scat",
            fantasyPull: 5,
            actualPleasure: 2,
            description: "Using feces as erotic element. Organizes extreme taboo.",
          },
          {
            practice: "Breeding fantasy",
            fantasyPull: 4,
            actualPleasure: 2,
            description: "Imagining impregnation. Organizes fertility and legacy.",
          },
          {
            practice: "Pregnancy play",
            fantasyPull: 3,
            actualPleasure: 2,
            description: "Eroticizing pregnancy. Organizes nurture and taboo.",
          },
          {
            practice: "Lactation play",
            fantasyPull: 4,
            actualPleasure: 3,
            description: "Milk as erotic symbol. Organizes nurturance.",
          },
          {
            practice: "Object insertion",
            fantasyPull: 6,
            actualPleasure: 1,
            description: "Using non-sexual objects. Organizes predictability and taboo.",
          },
          {
            practice: "Food play",
            fantasyPull: 3,
            actualPleasure: 1,
            description: "Using food in erotic context. Organizes sensory transgression.",
          },
        ],
      },
      {
        title: "Technology & Distance",
        rows: [
          {
            practice: "Sexting",
            fantasyPull: 3,
            actualPleasure: 1,
            description: "Sending erotic messages. Organizes anticipation and desire.",
          },
          {
            practice: "Erotic voice / audio",
            fantasyPull: 3,
            actualPleasure: 2,
            description: "Hearing arousing speech. Organizes intimacy through sound.",
          },
          {
            practice: "Erotic photography / filming",
            fantasyPull: 4,
            actualPleasure: 1,
            description: "Recording intimacy. Organizes being seen and remembered.",
          },
          {
            practice: "Mutual video masturbation",
            fantasyPull: 2,
            actualPleasure: 1,
            description: "Remote shared arousal. Organizes connection across distance.",
          },
          {
            practice: "Long-distance sexual play",
            fantasyPull: 3,
            actualPleasure: 3,
            description: "Maintaining intimacy when apart. Organizes emotional continuity.",
          },
        ],
      },
      {
        title: "Ritual, Tantra & Conscious Sex",
        rows: [
          {
            practice: "Tantra / spiritual sexuality",
            fantasyPull: 5,
            actualPleasure: 4,
            description: "Presence-based intimacy. Organizes awareness and depth.",
          },
          {
            practice: "Sacred kink",
            fantasyPull: 5,
            actualPleasure: 1,
            description: "Ritualized erotic power. Organizes meaning and transformation.",
          },
          {
            practice: "Sensual rituals",
            fantasyPull: 4,
            actualPleasure: 4,
            description: "Structured, intentional intimacy. Organizes focus and connection.",
          },
          {
            practice: "Mirror sex",
            fantasyPull: 3,
            actualPleasure: 1,
            description: "Watching oneself and partner. Organizes self-awareness.",
          },
          {
            practice: "Mutual surrender experience",
            fantasyPull: 5,
            actualPleasure: 2,
            description: "Letting go together. Organizes time and consistency and union.",
          },
          {
            practice: "Shadow work through sex",
            fantasyPull: 6,
            actualPleasure: 1,
            description: "Exploring shame or hidden parts. Organizes integration.",
          },
        ],
      },
    ],
  },
};
