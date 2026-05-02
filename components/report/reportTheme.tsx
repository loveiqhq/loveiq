import type { ComponentType, CSSProperties, SVGProps } from "react";
import {
  AnalyticalSexualistIcon,
  CuriousApprenticeIcon,
  DotsIcon,
  FadeIcon,
  getReportIconVars,
  GridIcon,
  HeartIcon,
  LeafIcon,
  MirrorIcon,
  RepeatIcon,
  reportArchetypeIconFits,
  type ReportIconFit,
  SparklesIcon,
  SpotlightIcon,
  SproutIcon,
  TargetIcon,
  ThumbsUpIcon,
} from "./reportArchetypeIcons";

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
  iconFit: ReportIconFit;
  Icon: ComponentType<IconProps>;
}

const MESSAGE_ICON = (props: IconProps) => (
  <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path
      d="M8 1C3.58125 1 0 3.90937 0 7.5C0 9.05 0.66875 10.4688 1.78125 11.5844C1.39062 13.1594 0.084375 14.5625 0.06875 14.5781C0 14.65 -0.01875 14.7562 0.021875 14.85C0.0625 14.9437 0.15 15 0.25 15C2.32188 15 3.875 14.0062 4.64375 13.3937C5.66563 13.7781 6.8 14 8 14C12.4187 14 16 11.0906 16 7.5C16 3.90937 12.4187 1 8 1Z"
      fill="currentColor"
    />
  </svg>
);

const BOLT_ICON = (props: IconProps) => (
  <svg viewBox="0 0 9 14" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path
      d="M8.3253 4.69995H5.07967L6.2778 1.04933C6.3903 0.621826 6.06686 0.199951 5.6253 0.199951H1.5753C1.2378 0.199951 0.950922 0.450264 0.905923 0.784951L0.0059225 7.53495C-0.047515 7.93995 0.267485 8.29995 0.675297 8.29995H4.01373L2.71717 13.7703C2.61592 14.1978 2.94217 14.6 3.37248 14.6C3.60873 14.6 3.83373 14.4762 3.95748 14.2625L8.90749 5.71245C9.16905 5.26526 8.84561 4.69995 8.3253 4.69995Z"
      fill="currentColor"
    />
  </svg>
);

const CROWN_ICON = (props: IconProps) => (
  <svg viewBox="0 0 18 15" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path
      d="M14.85 12.6H3.15C2.9025 12.6 2.7 12.8025 2.7 13.05V13.95C2.7 14.1975 2.9025 14.4 3.15 14.4H14.85C15.0975 14.4 15.3 14.1975 15.3 13.95V13.05C15.3 12.8025 15.0975 12.6 14.85 12.6ZM16.65 3.6C15.9047 3.6 15.3 4.20469 15.3 4.95C15.3 5.14969 15.345 5.33531 15.4237 5.50688L13.3875 6.7275C12.9544 6.98625 12.3947 6.84 12.1444 6.40125L9.85219 2.39062C10.1531 2.14312 10.35 1.77187 10.35 1.35C10.35 0.604688 9.74531 0 9 0C8.25469 0 7.65 0.604688 7.65 1.35C7.65 1.77187 7.84688 2.14312 8.14781 2.39062L5.85562 6.40125C5.60531 6.84 5.04281 6.98625 4.6125 6.7275L2.57906 5.50688C2.655 5.33812 2.70281 5.14969 2.70281 4.95C2.70281 4.20469 2.09812 3.6 1.35281 3.6C0.6075 3.6 0 4.20469 0 4.95C0 5.69531 0.604688 6.3 1.35 6.3C1.42312 6.3 1.49625 6.28875 1.56656 6.2775L3.6 11.7H14.4L16.4334 6.2775C16.5037 6.28875 16.5769 6.3 16.65 6.3C17.3953 6.3 18 5.69531 18 4.95C18 4.20469 17.3953 3.6 16.65 3.6Z"
      fill="currentColor"
    />
  </svg>
);

const ATTACHMENT_ICON = (props: IconProps) => (
  <svg viewBox="0 0 16 14" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path
      d="M14.447 0.95727C12.7345 -0.502078 10.1877 -0.239583 8.61584 1.38226L8.00023 2.01663L7.38462 1.38226C5.8159 -0.239583 3.26595 -0.502078 1.55348 0.95727C-0.408984 2.63224 -0.512107 5.63843 1.24411 7.45403L7.29087 13.6977C7.68149 14.1008 8.31585 14.1008 8.70647 13.6977L14.7532 7.45403C16.5126 5.63843 16.4094 2.63224 14.447 0.95727Z"
      fill="currentColor"
    />
  </svg>
);

export const TraitIcons = {
  communication: MESSAGE_ICON,
  initiation: BOLT_ICON,
  attachment: ATTACHMENT_ICON,
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
    iconFit: reportArchetypeIconFits["Sensual Connector"],
    Icon: HeartIcon,
  }),
  "Spark Seeker": makeTheme({
    archetype: "Spark Seeker",
    accent: "#FF6A3D",
    iconBackground: "#FF6A3D",
    motto: '"Let\'s find the spark\u2014then turn it into a blaze."',
    motivation: "Pleasure & play",
    communication: "Charming",
    initiation: "Active",
    attachment: "Avoidant/secure",
    powerOrientation: "Switch",
    riskOrientation: "High",
    riskSegments: 3,
    confidence: "High",
    confidenceSegments: 3,
    iconFit: reportArchetypeIconFits["Spark Seeker"],
    Icon: SparklesIcon,
  }),
  "Relational Nurturer": makeTheme({
    archetype: "Relational Nurturer",
    accent: "#8EB9AA",
    iconBackground: "#8EB9AA",
    motto: '"Your comfort and pleasure matter\u2014so do mine."',
    motivation: "Healing",
    communication: "Gentle",
    initiation: "Responsive",
    attachment: "Secure",
    powerOrientation: "Submissive/switch",
    riskOrientation: "Low",
    riskSegments: 1,
    confidence: "Moderate",
    confidenceSegments: 2,
    iconFit: reportArchetypeIconFits["Relational Nurturer"],
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
    iconFit: reportArchetypeIconFits["Exhibitionist Performer"],
    Icon: SpotlightIcon,
  }),
  "Explorer of Edges": makeTheme({
    archetype: "Explorer of Edges",
    accent: "#FF3D76",
    iconBackground: "#FF3D76",
    motto: '"Let\'s find the edge\u2014and keep going."',
    motivation: "Intensity & transformation",
    communication: "Honest",
    initiation: "Active",
    attachment: "Disorganized",
    powerOrientation: "Dominant/Switch",
    riskOrientation: "Very high",
    riskSegments: 3,
    confidence: "High",
    confidenceSegments: 3,
    iconFit: reportArchetypeIconFits["Explorer of Edges"],
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
    iconFit: reportArchetypeIconFits["Curious Apprentice"],
    Icon: CuriousApprenticeIcon,
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
    iconFit: reportArchetypeIconFits["Spiritual Lover"],
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
    iconFit: reportArchetypeIconFits["Minimalist Companion"],
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
    iconFit: reportArchetypeIconFits["Emotional Voyeur"],
    Icon: MirrorIcon,
  }),
  "Power Orchestrator": makeTheme({
    archetype: "Power Orchestrator",
    accent: "#F3A62A",
    iconBackground: "#F3A62A",
    motto: '"I set the frame\u2014and we play inside it."',
    motivation: "Power",
    communication: "Commanding",
    initiation: "Active",
    attachment: "Disorganized",
    powerOrientation: "Dominant",
    riskOrientation: "High",
    riskSegments: 3,
    confidence: "High",
    confidenceSegments: 3,
    iconFit: reportArchetypeIconFits["Power Orchestrator"],
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
    iconFit: reportArchetypeIconFits["Loyal Ritualist"],
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
    iconFit: reportArchetypeIconFits["Approval Seeker"],
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
    iconFit: reportArchetypeIconFits["Analytical Sexualist"],
    Icon: AnalyticalSexualistIcon,
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
    iconFit: reportArchetypeIconFits["Quiet Withdrawer"],
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

export function getReportThemeIconStyle(
  theme: ReportTheme,
  slot: keyof ReportTheme["iconFit"]
): CSSProperties {
  return getReportIconVars(theme.iconFit, slot);
}

export { reportArchetypeIconFits };
