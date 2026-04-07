import type { ComponentType, CSSProperties, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

export interface ReportTheme {
  archetype: string;
  accent: string;
  accentRgb: string;
  iconBackground: string;
  iconBackgroundRgb: string;
  motto: string;
  motivation: string;
  communication: string;
  initiation: string;
  attachment: string;
  powerOrientation: string;
  riskOrientation: string;
  riskSegments: 1 | 2 | 3;
  confidence: string;
  confidenceSegments: 1 | 2 | 3;
  Icon: ComponentType<IconProps>;
}

const traitIconProps = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  strokeWidth: 1.7,
} as const;

const HeartIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
    <path
      d="M12 21.35 10.55 20C5.4 15.36 2 12.28 2 8.5A4.5 4.5 0 0 1 6.5 4c1.74 0 3.41.81 4.5 2.09A6.04 6.04 0 0 1 12 7.35a6.04 6.04 0 0 1 1-1.26A5.87 5.87 0 0 1 17.5 4 4.5 4.5 0 0 1 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35Z"
      {...traitIconProps}
    />
  </svg>
);

const SparklesIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
    <path
      d="m12 3 1.85 5.15L19 10l-5.15 1.85L12 17l-1.85-5.15L5 10l5.15-1.85L12 3Z"
      {...traitIconProps}
    />
    <path d="m19 2 .75 2.25L22 5l-2.25.75L19 8l-.75-2.25L16 5l2.25-.75L19 2Z" {...traitIconProps} />
    <path d="m6 15 .75 2.25L9 18l-2.25.75L6 21l-.75-2.25L3 18l2.25-.75L6 15Z" {...traitIconProps} />
  </svg>
);

const SproutIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
    <path d="M12 13v8" {...traitIconProps} />
    <path d="M12 13c0-3.87 2.38-7 6-8 0 4.42-2.13 7.8-6 8Z" {...traitIconProps} />
    <path d="M12 13c0-3.87-2.38-7-6-8 0 4.42 2.13 7.8 6 8Z" {...traitIconProps} />
    <path d="M7 21h10" {...traitIconProps} />
  </svg>
);

const SpotlightIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
    <path d="M8 4h8l-1.5 10h-5L8 4Z" {...traitIconProps} />
    <path d="M9.5 16c.77-.67 1.6-1 2.5-1s1.73.33 2.5 1" {...traitIconProps} />
    <path d="M6 20c1.7-1.33 3.7-2 6-2s4.3.67 6 2" {...traitIconProps} />
  </svg>
);

const TargetIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
    <circle cx="12" cy="12" r="8" {...traitIconProps} />
    <circle cx="12" cy="12" r="3" {...traitIconProps} />
    <path d="m16 8 4-4" {...traitIconProps} />
    <path d="m18 4 2 2" {...traitIconProps} />
  </svg>
);

const BookIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
    <path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H18v16H7.5A2.5 2.5 0 0 0 5 21.5V5.5Z" {...traitIconProps} />
    <path d="M19 3v16" {...traitIconProps} />
    <path d="M5 19.5A2.5 2.5 0 0 1 7.5 17H18" {...traitIconProps} />
  </svg>
);

const LeafIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
    <path d="M19 5c-8.5 0-13 4.5-13 13 8.5 0 13-4.5 13-13Z" {...traitIconProps} />
    <path d="M8 16c3-4 5.67-6.33 8-7" {...traitIconProps} />
  </svg>
);

const DotsIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
    <circle cx="12" cy="5" r="2" fill="currentColor" />
    <circle cx="12" cy="12" r="2" fill="currentColor" />
    <circle cx="12" cy="19" r="2" fill="currentColor" />
  </svg>
);

const MirrorIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
    <path d="M3 6v12" {...traitIconProps} />
    <path d="M21 6v12" {...traitIconProps} />
    <path d="M11 8 6 12l5 4V8Z" {...traitIconProps} />
    <path d="m13 8 5 4-5 4V8Z" {...traitIconProps} />
    <path d="M12 4v16" strokeDasharray="2.5 2.5" {...traitIconProps} />
  </svg>
);

const GridIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
    {[
      [4, 4],
      [10, 4],
      [16, 4],
      [4, 10],
      [10, 10],
      [16, 10],
      [4, 16],
      [10, 16],
      [16, 16],
    ].map(([x, y]) => (
      <rect key={`${x}-${y}`} x={x} y={y} width="4" height="4" rx="0.9" fill="currentColor" />
    ))}
  </svg>
);

const RepeatIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
    <path d="M17 2l3 3-3 3" {...traitIconProps} />
    <path d="M4 11V9a4 4 0 0 1 4-4h12" {...traitIconProps} />
    <path d="m7 22-3-3 3-3" {...traitIconProps} />
    <path d="M20 13v2a4 4 0 0 1-4 4H4" {...traitIconProps} />
  </svg>
);

const ThumbsUpIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
    <path d="M7 22H3V10h4" {...traitIconProps} />
    <path
      d="M14 10V5.5a2.5 2.5 0 0 0-5 0v2L7 10v12h9.8a2.5 2.5 0 0 0 2.43-1.92l1.46-6a2.5 2.5 0 0 0-2.43-3.08H14Z"
      {...traitIconProps}
    />
  </svg>
);

const MoleculeIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
    <circle cx="12" cy="5" r="2" {...traitIconProps} />
    <circle cx="6" cy="10" r="2" {...traitIconProps} />
    <circle cx="18" cy="10" r="2" {...traitIconProps} />
    <circle cx="8" cy="18" r="2" {...traitIconProps} />
    <circle cx="16" cy="18" r="2" {...traitIconProps} />
    <path d="M10.4 6.3 7.6 8.7" {...traitIconProps} />
    <path d="m13.6 6.3 2.8 2.4" {...traitIconProps} />
    <path d="m7 12 1 4" {...traitIconProps} />
    <path d="m17 12-1 4" {...traitIconProps} />
    <path d="M8.8 17h6.4" {...traitIconProps} />
    <path d="M8 10h8" {...traitIconProps} />
  </svg>
);

const FadeIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
    <path d="M5 12a7 7 0 0 1 7-7v14a7 7 0 0 1-7-7Z" {...traitIconProps} />
    <path d="M14 5v14" {...traitIconProps} />
    <path d="M18 7v10" {...traitIconProps} />
    <path d="M21 9v6" {...traitIconProps} />
  </svg>
);

const MESSAGE_ICON = (props: IconProps) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
    <path
      d="M5 7.5A3.5 3.5 0 0 1 8.5 4h7A3.5 3.5 0 0 1 19 7.5v5A3.5 3.5 0 0 1 15.5 16H9l-4 4v-4.5A3.5 3.5 0 0 1 5 12.5v-5Z"
      {...traitIconProps}
    />
  </svg>
);

const BOLT_ICON = (props: IconProps) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
    <path d="M13 2 6 13h5l-1 9 7-11h-5l1-9Z" {...traitIconProps} />
  </svg>
);

const CROWN_ICON = (props: IconProps) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
    <path d="m4 18 2-9 6 4 6-4 2 9H4Z" {...traitIconProps} />
    <path d="M7 18h10" {...traitIconProps} />
    <path d="M6 9 4 6" {...traitIconProps} />
    <path d="m18 9 2-3" {...traitIconProps} />
    <path d="m12 13 0-8" {...traitIconProps} />
  </svg>
);

export const TraitIcons = {
  communication: MESSAGE_ICON,
  initiation: BOLT_ICON,
  attachment: HeartIcon,
  powerOrientation: CROWN_ICON,
} as const;

function hexToRgbTriplet(hex: string) {
  const clean = hex.replace("#", "");
  const normalized =
    clean.length === 3
      ? clean
          .split("")
          .map((char) => `${char}${char}`)
          .join("")
      : clean;
  const value = Number.parseInt(normalized, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `${red} ${green} ${blue}`;
}

function makeTheme(theme: Omit<ReportTheme, "accentRgb" | "iconBackgroundRgb">): ReportTheme {
  return {
    ...theme,
    accentRgb: hexToRgbTriplet(theme.accent),
    iconBackgroundRgb: hexToRgbTriplet(theme.iconBackground),
  };
}

export const reportThemes: Record<string, ReportTheme> = {
  "Sensual Connector": makeTheme({
    archetype: "Sensual Connector",
    accent: "#EB7A84",
    iconBackground: "#E97C84",
    motto: '"Touch me with presence and meet me with heart."',
    motivation: "Intimacy & bonding",
    communication: "Authentic",
    initiation: "Responsive",
    attachment: "Secure",
    powerOrientation: "Switch",
    riskOrientation: "Low",
    riskSegments: 1,
    confidence: "Moderate",
    confidenceSegments: 2,
    Icon: HeartIcon,
  }),
  "Spark Seeker": makeTheme({
    archetype: "Spark Seeker",
    accent: "#FF6A3D",
    iconBackground: "#FF6A3D",
    motto: '"Let\'s find the spark - then turn it into a blaze."',
    motivation: "Pleasure & play",
    communication: "Charming",
    initiation: "Active",
    attachment: "Avoidant/secure",
    powerOrientation: "Switch",
    riskOrientation: "High",
    riskSegments: 3,
    confidence: "High",
    confidenceSegments: 3,
    Icon: SparklesIcon,
  }),
  "Relational Nurturer": makeTheme({
    archetype: "Relational Nurturer",
    accent: "#8EB9AA",
    iconBackground: "#8EB9AA",
    motto: '"Your comfort and pleasure matter-so do mine."',
    motivation: "Healing",
    communication: "Gentle",
    initiation: "Responsive",
    attachment: "Secure",
    powerOrientation: "Submissive/switch",
    riskOrientation: "Low",
    riskSegments: 1,
    confidence: "Moderate",
    confidenceSegments: 2,
    Icon: SproutIcon,
  }),
  "Exhibitionist Performer": makeTheme({
    archetype: "Exhibitionist Performer",
    accent: "#E5B85A",
    iconBackground: "#E5B85A",
    motto: '"Watch me shine."',
    motivation: "Validation",
    communication: "Expressive",
    initiation: "Active",
    attachment: "Mixed",
    powerOrientation: "Switch",
    riskOrientation: "High",
    riskSegments: 3,
    confidence: "High",
    confidenceSegments: 3,
    Icon: SpotlightIcon,
  }),
  "Explorer of Edges": makeTheme({
    archetype: "Explorer of Edges",
    accent: "#FF3D76",
    iconBackground: "#FF3D76",
    motto: '"Let\'s find the edge-and keep going."',
    motivation: "Intensity & transformation",
    communication: "Honest",
    initiation: "Active",
    attachment: "Disorganized",
    powerOrientation: "Dominant/Switch",
    riskOrientation: "Very high",
    riskSegments: 3,
    confidence: "High",
    confidenceSegments: 3,
    Icon: TargetIcon,
  }),
  "Curious Apprentice": makeTheme({
    archetype: "Curious Apprentice",
    accent: "#78B7E8",
    iconBackground: "#78B7E8",
    motto: '"Teach me everything."',
    motivation: "Growth",
    communication: "Open",
    initiation: "Shared",
    attachment: "Secure",
    powerOrientation: "Switch",
    riskOrientation: "Moderate",
    riskSegments: 2,
    confidence: "Moderate",
    confidenceSegments: 2,
    Icon: BookIcon,
  }),
  "Spiritual Lover": makeTheme({
    archetype: "Spiritual Lover",
    accent: "#9D8AD7",
    iconBackground: "#9D8AD7",
    motto: '"Make love to my soul."',
    motivation: "Meaning",
    communication: "Deep",
    initiation: "Responsive",
    attachment: "Secure",
    powerOrientation: "Switch",
    riskOrientation: "Low",
    riskSegments: 1,
    confidence: "Moderate",
    confidenceSegments: 2,
    Icon: LeafIcon,
  }),
  "Minimalist Companion": makeTheme({
    archetype: "Minimalist Companion",
    accent: "#BDB9B4",
    iconBackground: "#BDB9B4",
    motto: '"Simple is enough."',
    motivation: "Connection",
    communication: "Calm",
    initiation: "Passive",
    attachment: "Avoidant",
    powerOrientation: "Submissive",
    riskOrientation: "Low",
    riskSegments: 1,
    confidence: "Low",
    confidenceSegments: 1,
    Icon: DotsIcon,
  }),
  "Emotional Voyeur": makeTheme({
    archetype: "Emotional Voyeur",
    accent: "#34EAE4",
    iconBackground: "#34EAE4",
    motto: '"I feel more from observing."',
    motivation: "Emotional fantasy",
    communication: "Reserved",
    initiation: "Passive",
    attachment: "Avoidant",
    powerOrientation: "Submissive",
    riskOrientation: "Low",
    riskSegments: 1,
    confidence: "Low",
    confidenceSegments: 1,
    Icon: MirrorIcon,
  }),
  "Power Orchestrator": makeTheme({
    archetype: "Power Orchestrator",
    accent: "#F3A62A",
    iconBackground: "#F3A62A",
    motto: '"I set the frame-and we play inside it."',
    motivation: "Power",
    communication: "Commanding",
    initiation: "Active",
    attachment: "Disorganized",
    powerOrientation: "Dominant",
    riskOrientation: "High",
    riskSegments: 3,
    confidence: "High",
    confidenceSegments: 3,
    Icon: GridIcon,
  }),
  "Loyal Ritualist": makeTheme({
    archetype: "Loyal Ritualist",
    accent: "#2AFD96",
    iconBackground: "#2AFD96",
    motto: '"Routine is intimacy."',
    motivation: "Stability",
    communication: "Consistent",
    initiation: "Shared",
    attachment: "Secure",
    powerOrientation: "Switch",
    riskOrientation: "Low",
    riskSegments: 1,
    confidence: "Moderate",
    confidenceSegments: 2,
    Icon: RepeatIcon,
  }),
  "Approval Seeker": makeTheme({
    archetype: "Approval Seeker",
    accent: "#E7B6C8",
    iconBackground: "#E2AEC2",
    motto: '"Tell me I\'m enough."',
    motivation: "Validation",
    communication: "Adaptive",
    initiation: "Responsive",
    attachment: "Anxious",
    powerOrientation: "Submissive",
    riskOrientation: "Low",
    riskSegments: 1,
    confidence: "Low",
    confidenceSegments: 1,
    Icon: ThumbsUpIcon,
  }),
  "Analytical Sexualist": makeTheme({
    archetype: "Analytical Sexualist",
    accent: "#7A17FF",
    iconBackground: "#7A17FF",
    motto: '"Explain the system."',
    motivation: "Mastery",
    communication: "Precise",
    initiation: "Shared",
    attachment: "Avoidant",
    powerOrientation: "Switch",
    riskOrientation: "Moderate",
    riskSegments: 2,
    confidence: "Moderate",
    confidenceSegments: 2,
    Icon: MoleculeIcon,
  }),
  "Quiet Withdrawer": makeTheme({
    archetype: "Quiet Withdrawer",
    accent: "#C7F3F1",
    iconBackground: "#C7F3F1",
    motto: '"I disappear to survive."',
    motivation: "Avoidance",
    communication: "Reserved",
    initiation: "None",
    attachment: "Avoidant",
    powerOrientation: "Submissive",
    riskOrientation: "Low",
    riskSegments: 1,
    confidence: "Low",
    confidenceSegments: 1,
    Icon: FadeIcon,
  }),
};

const fallbackTheme = reportThemes["Spark Seeker"];

export function getReportTheme(archetype: string) {
  return reportThemes[archetype] ?? fallbackTheme;
}

export function getReportThemeStyle(theme: ReportTheme): CSSProperties {
  return {
    ["--report-accent" as string]: theme.accent,
    ["--report-accent-rgb" as string]: theme.accentRgb,
    ["--report-icon-bg" as string]: theme.iconBackground,
    ["--report-icon-bg-rgb" as string]: theme.iconBackgroundRgb,
  };
}
