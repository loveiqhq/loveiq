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
  <svg width="16" height="14" viewBox="0 0 16 14" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M14.447 0.95727C12.7345 -0.502078 10.1877 -0.239583 8.61584 1.38226L8.00023 2.01663L7.38462 1.38226C5.8159 -0.239583 3.26595 -0.502078 1.55348 0.95727C-0.408984 2.63224 -0.512107 5.63843 1.24411 7.45403L7.29087 13.6977C7.68149 14.1008 8.31585 14.1008 8.70647 13.6977L14.7532 7.45403C16.5126 5.63843 16.4094 2.63224 14.447 0.95727Z"
      fill="#FF6A3D"
    />
  </svg>
);

const SparklesIcon = (props: IconProps) => (
  <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M31.8896 19.2816C31.8896 18.655 31.538 18.08 30.978 17.795C29.5446 17.065 28.0096 16.3933 26.2896 15.74C23.4463 14.65 21.3746 12.5466 20.298 9.66498C19.653 7.91665 18.9896 6.35998 18.2713 4.90665C17.9896 4.33998 17.4096 3.97998 16.778 3.97998C16.1463 3.97998 15.563 4.33998 15.2846 4.90831C14.568 6.35665 13.9063 7.91331 13.2613 9.65831C12.1846 12.545 10.1113 14.6483 7.27297 15.7366C5.54297 16.395 4.0063 17.0666 2.57797 17.795C2.01964 18.0783 1.66797 18.6533 1.66797 19.28C1.66797 19.9066 2.01964 20.4816 2.57964 20.7666C4.0163 21.4966 5.5513 22.17 7.26797 22.82C10.1113 23.91 12.183 26.0133 13.2596 28.8966C13.908 30.6516 14.5696 32.205 15.2846 33.6533C15.5663 34.2216 16.1446 34.5816 16.778 34.5816C17.4113 34.5816 17.9913 34.2216 18.2713 33.6533C18.9896 32.205 19.6513 30.6483 20.2946 28.9016C21.373 26.015 23.448 23.9116 26.283 22.8233C28.0063 22.17 29.5413 21.4983 30.978 20.7683C31.538 20.4833 31.8896 19.91 31.8896 19.2816Z"
      fill="#130B17"
    />
    <path
      d="M28.4934 10.9034C28.9184 11.1201 29.3367 11.2984 29.7484 11.4551C30.0934 11.5884 30.3351 11.8351 30.4651 12.1801C30.6184 12.6017 30.7934 13.0217 31.0051 13.4517C31.2834 14.0217 31.8634 14.3851 32.4984 14.3851H32.5017C33.1351 14.3851 33.7151 14.0251 33.9951 13.4567C34.2067 13.0284 34.3801 12.6067 34.5351 12.1884C34.6684 11.8351 34.9101 11.5884 35.2484 11.4584C35.6667 11.3001 36.0834 11.1217 36.5084 10.9051C37.0684 10.6217 37.4201 10.0451 37.4201 9.41841C37.4201 8.79174 37.0667 8.21675 36.5067 7.93341C36.0834 7.72008 35.6667 7.54174 35.2534 7.38341C34.9101 7.25174 34.6684 7.00508 34.5367 6.65508C34.3801 6.23341 34.2067 5.81174 33.9934 5.38174C33.7134 4.81508 33.1334 4.45508 32.5001 4.45508H32.4967C31.8617 4.45508 31.2834 4.81674 31.0034 5.38674C30.7934 5.81508 30.6184 6.23674 30.4667 6.65008C30.3334 7.00341 30.0917 7.25008 29.7534 7.38008C29.3334 7.54008 28.9167 7.71675 28.4917 7.93341C27.9317 8.21675 27.5801 8.79174 27.5801 9.41841C27.5801 10.0451 27.9317 10.6201 28.4917 10.9034H28.4934Z"
      fill="#130B17"
    />
    <path
      d="M37.4219 28.6415C36.8935 28.3732 36.3719 28.1499 35.8585 27.9565C35.2935 27.7399 34.8819 27.3199 34.6702 26.7499C34.4752 26.2232 34.2569 25.6965 33.9935 25.1632C33.7119 24.5949 33.1319 24.2349 32.5002 24.2349C31.8652 24.2349 31.2852 24.5965 31.0069 25.1665C30.7452 25.6999 30.5269 26.2249 30.3369 26.7415C30.1202 27.3199 29.7085 27.7399 29.1519 27.9532C28.6319 28.1499 28.1085 28.3732 27.5819 28.6432C27.0235 28.9282 26.6719 29.5015 26.6719 30.1282C26.6719 30.7549 27.0235 31.3282 27.5819 31.6132C28.1085 31.8815 28.6285 32.1032 29.1469 32.3015C29.7085 32.5165 30.1202 32.9349 30.3335 33.5065C30.5269 34.0315 30.7452 34.5582 31.0085 35.0899C31.2885 35.6582 31.8669 36.0182 32.5019 36.0199C33.1352 36.0199 33.7135 35.6615 33.9952 35.0932C34.2602 34.5599 34.4785 34.0332 34.6719 33.5115C34.8852 32.9349 35.2969 32.5165 35.8585 32.3015C36.3785 32.1032 36.8969 31.8832 37.4235 31.6149C37.9835 31.3299 38.3352 30.7549 38.3352 30.1282C38.3352 29.5015 37.9835 28.9265 37.4235 28.6415H37.4219Z"
      fill="#130B17"
    />
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
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M8 1C3.58125 1 0 3.90937 0 7.5C0 9.05 0.66875 10.4688 1.78125 11.5844C1.39062 13.1594 0.084375 14.5625 0.06875 14.5781C0 14.65 -0.01875 14.7562 0.021875 14.85C0.0625 14.9437 0.15 15 0.25 15C2.32188 15 3.875 14.0062 4.64375 13.3937C5.66563 13.7781 6.8 14 8 14C12.4187 14 16 11.0906 16 7.5C16 3.90937 12.4187 1 8 1Z"
      fill="#FF6A3D"
    />
  </svg>
);

const BOLT_ICON = (props: IconProps) => (
  <svg width="9" height="14" viewBox="0 0 9 14" fill="none" xmlns="http://www.w3.org/2000/svg">
    <g clip-path="url(#clip0_4474_4051)">
      <path
        d="M8.3253 4.69995H5.07967L6.2778 1.04933C6.3903 0.621826 6.06686 0.199951 5.6253 0.199951H1.5753C1.2378 0.199951 0.950922 0.450264 0.905923 0.784951L0.0059225 7.53495C-0.047515 7.93995 0.267485 8.29995 0.675297 8.29995H4.01373L2.71717 13.7703C2.61592 14.1978 2.94217 14.6 3.37248 14.6C3.60873 14.6 3.83373 14.4762 3.95748 14.2625L8.90749 5.71245C9.16905 5.26526 8.84561 4.69995 8.3253 4.69995Z"
        fill="#FF6A3D"
      />
    </g>
    <defs>
      <clipPath id="clip0_4474_4051">
        <rect width="9" height="14" fill="white" />
      </clipPath>
    </defs>
  </svg>
);

const CROWN_ICON = (props: IconProps) => (
  <svg width="18" height="15" viewBox="0 0 18 15" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M14.85 12.6H3.15C2.9025 12.6 2.7 12.8025 2.7 13.05V13.95C2.7 14.1975 2.9025 14.4 3.15 14.4H14.85C15.0975 14.4 15.3 14.1975 15.3 13.95V13.05C15.3 12.8025 15.0975 12.6 14.85 12.6ZM16.65 3.6C15.9047 3.6 15.3 4.20469 15.3 4.95C15.3 5.14969 15.345 5.33531 15.4237 5.50688L13.3875 6.7275C12.9544 6.98625 12.3947 6.84 12.1444 6.40125L9.85219 2.39062C10.1531 2.14312 10.35 1.77187 10.35 1.35C10.35 0.604688 9.74531 0 9 0C8.25469 0 7.65 0.604688 7.65 1.35C7.65 1.77187 7.84688 2.14312 8.14781 2.39062L5.85562 6.40125C5.60531 6.84 5.04281 6.98625 4.6125 6.7275L2.57906 5.50688C2.655 5.33812 2.70281 5.14969 2.70281 4.95C2.70281 4.20469 2.09812 3.6 1.35281 3.6C0.6075 3.6 0 4.20469 0 4.95C0 5.69531 0.604688 6.3 1.35 6.3C1.42312 6.3 1.49625 6.28875 1.56656 6.2775L3.6 11.7H14.4L16.4334 6.2775C16.5037 6.28875 16.5769 6.3 16.65 6.3C17.3953 6.3 18 5.69531 18 4.95C18 4.20469 17.3953 3.6 16.65 3.6Z"
      fill="#FF6A3D"
    />
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
