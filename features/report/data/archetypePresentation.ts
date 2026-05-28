import type { ArchetypeName } from "@features/report/server/archetypeSlug";

export interface ArchetypePresentation {
  iconSrc: string;
  iconBg: string | null;
  barColorRgba: string;
  dotColor: string;
  dotShadowColor: string;
  tagline: string;
}

const ASSET_BASE = "/images/archetypes/breakdown";

export const archetypePresentation: Record<ArchetypeName, ArchetypePresentation> = {
  "Authority Conductor": {
    iconSrc: `${ASSET_BASE}/authority-conductor.svg`,
    iconBg: "#ff9f1c",
    barColorRgba: "rgba(234,179,8,0.6)",
    dotColor: "#eab308",
    dotShadowColor: "#eab308",
    tagline: "“Let me lead the rhythm, set the rules, and build the tension between us.”",
  },
  "Loyal Ritualist": {
    iconSrc: `${ASSET_BASE}/loyal-ritualist.svg`,
    iconBg: "#2aff8f",
    barColorRgba: "rgba(34,197,94,0.6)",
    dotColor: "#22c55e",
    dotShadowColor: "#22c55e",
    tagline:
      "“Give me the familiar touch, the trusted rhythm, and the comfort of knowing we always return to this.”",
  },
  "Explorer of Edges": {
    iconSrc: `${ASSET_BASE}/explorer-of-edges.svg`,
    iconBg: "#ff2e63",
    barColorRgba: "rgba(236,72,153,0.6)",
    dotColor: "#ec4899",
    dotShadowColor: "#ec4899",
    tagline: "“Take me somewhere new, intense, and real enough to shake me awake.”",
  },
  "Spark Seeker": {
    iconSrc: `${ASSET_BASE}/spark-seeker.svg`,
    iconBg: "#ff6a3d",
    barColorRgba: "rgba(249,115,22,0.6)",
    dotColor: "#f97316",
    dotShadowColor: "#f97316",
    tagline: "“Tease me, surprise me, chase me a little — I want sex to feel alive.”",
  },
  "Radiant Performer": {
    iconSrc: `${ASSET_BASE}/radiant-performer.svg`,
    iconBg: "#e6b65c",
    barColorRgba: "rgba(250,204,21,0.6)",
    dotColor: "#facc15",
    dotShadowColor: "#facc15",
    tagline: "“Look at me like you want me, and I’ll show you more of myself.”",
  },
  "Spiritual Lover": {
    iconSrc: `${ASSET_BASE}/spiritual-lover.svg`,
    iconBg: "#8b7bbe",
    barColorRgba: "rgba(139,92,246,0.6)",
    dotColor: "#8b5cf6",
    dotShadowColor: "#a78bfa",
    tagline: "“Make it feel meaningful — like our bodies are saying something deeper.”",
  },
  "Curious Apprentice": {
    iconSrc: `${ASSET_BASE}/curious-apprentice.svg`,
    iconBg: "#6faed9",
    barColorRgba: "rgba(6,182,212,0.6)",
    dotColor: "#06b6d4",
    dotShadowColor: "#22d3ee",
    tagline: "“Guide me, show me what you like, and let us learn what feels good together.”",
  },
  "Relational Nurturer": {
    iconSrc: `${ASSET_BASE}/relational-nurturer.svg`,
    iconBg: null,
    barColorRgba: "rgba(16,185,129,0.6)",
    dotColor: "#10b981",
    dotShadowColor: "#34d399",
    tagline: "“Let us make each other feel safe, cared for, and wanted again.”",
  },
  "Tender Devotee": {
    iconSrc: `${ASSET_BASE}/tender-devotee.svg`,
    iconBg: "#e7b3c2",
    barColorRgba: "rgba(239,70,197,0.6)",
    dotColor: "#ef46c5",
    dotShadowColor: "#e879f9",
    tagline: "“Tell me I’m wanted, show me I’m enough, and I’ll slowly open to you.”",
  },
  "Sensual Connector": {
    iconSrc: `${ASSET_BASE}/sensual-connector.svg`,
    iconBg: "#e57373",
    barColorRgba: "rgba(239,68,68,0.6)",
    dotColor: "#ef4444",
    dotShadowColor: "#f87171",
    tagline: "“Hold me close, take your time, and let me feel that you are really here with me.”",
  },
  "Analytical Sexualist": {
    iconSrc: `${ASSET_BASE}/analytical-sexualist.svg`,
    iconBg: "#6a00ff",
    barColorRgba: "rgba(99,102,241,0.6)",
    dotColor: "#6366f1",
    dotShadowColor: "#818cf8",
    tagline:
      "“Tell me what works, let me understand your body, and I’ll get better at pleasing you.”",
  },
  "Emotional Voyeur": {
    iconSrc: `${ASSET_BASE}/emotional-voyeur.svg`,
    iconBg: "#2ef6e3",
    barColorRgba: "rgba(46,246,227,0.6)",
    dotColor: "#2ef6e3",
    dotShadowColor: "#fbbf24",
    tagline: "“Let me watch, imagine, and feel the tension before I fully step in.”",
  },
  "Minimalist Companion": {
    iconSrc: `${ASSET_BASE}/minimalist-companion.svg`,
    iconBg: "#b5b2ad",
    barColorRgba: "rgba(148,163,184,0.6)",
    dotColor: "#94a3b8",
    dotShadowColor: "#cbd5e1",
    tagline: "“No pressure, no performance — just be close, be kind, and stay with me.”",
  },
  "Quiet Withdrawer": {
    iconSrc: `${ASSET_BASE}/quiet-withdrawer.svg`,
    iconBg: "#c9f7f5",
    barColorRgba: "rgba(201,247,245,0.6)",
    dotColor: "#c9f7f5",
    dotShadowColor: "#fda4af",
    tagline: "“Come slowly, ask gently, and let me feel that I can say no and still be safe.”",
  },
};

export const archetypeBreakdownStaticAssets = {
  methodology: `${ASSET_BASE}/methodology.svg`,
  pillRing: `${ASSET_BASE}/pill-ring.svg`,
  pillLock: `${ASSET_BASE}/pill-lock.svg`,
  ctaIconLeft: `${ASSET_BASE}/cta-icon-left.svg`,
  ctaIconRight: `${ASSET_BASE}/cta-icon-right.svg`,
} as const;
