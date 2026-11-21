/**
 * The ap-* colours (AP-Analytics and Mira, Marcus's light tokens of 12 Oct 2026) and Mira's dark
 * theme (21 Nov 2026), in one place: tailwind.config.js turns them into CSS variables, so every
 * `text-ap-ink`, `bg-white` or `border-ap-line` follows the theme with no `dark:` class anywhere.
 *
 * - `AP_LIGHT` is :root, everywhere on the site: AP's admin and Mira's light theme look exactly
 *   as they did before the variables.
 * - `MIRA_DARK` replaces it while a Mira page is set to Dark, or to System on a dark device.
 *   The light ink became the dark paper: a deep plum, with light text and lighter fills.
 * - `paper` is what Tailwind's `white` means here: the page and card colour. On the ink pill and
 *   other fills, `text-white` is the paper colour, so it turns dark with the fill turning light.
 *
 * Plain CommonJS: tailwind.config.js requires it. Contrast is checked in
 * features/mira/tests/mira-settings-theme.test.ts.
 */
const AP_LIGHT = {
  ink: "#161021",
  body: "#3f3a4d",
  muted: "#6b6678",
  label: "#5f6675",
  quiet: "#9c95a3",
  line: "#e9e6ee",
  ground: "#f5f6f8",
  lilac: "#f3ecff",
  track: "#f0eef4",
  purple: "#795fc8",
  violet: "#4000b6",
  plum: "#6b5b95",
  lavender: "#9d8ad7",
  mist: "#d6cff0",
  orange: "#fe6839",
  good: "#2e7d5b",
  "good-ink": "#1f5c42",
  bad: "#d63200",
  "bad-ink": "#a62700",
  pii: "#a8431f",
  /** Links in the support panel and the guide (the deep violet they had as #561dbd). */
  link: "#561dbd",
  paper: "#ffffff",
};

const MIRA_DARK = {
  ink: "#f4f0fa",
  body: "#d7d0e2",
  muted: "#ada6bb",
  label: "#aab0bd",
  quiet: "#8e879b",
  line: "#2f2839",
  ground: "#221b2d",
  lilac: "#2c2244",
  track: "#2a2335",
  purple: "#ab95f2",
  violet: "#b9a3ff",
  plum: "#c6b8ee",
  lavender: "#9d8ad7",
  mist: "#463c63",
  orange: "#ff7f55",
  good: "#4cc08d",
  "good-ink": "#7ad6ac",
  bad: "#ff7759",
  "bad-ink": "#ff9c86",
  pii: "#f0a07c",
  link: "#c3aefc",
  paper: "#161021",
};

/** Text size: every font size on a Mira page times this (1 is Default). */
const TEXT_SCALE = { small: 0.9, large: 1.15 };

module.exports = { AP_LIGHT, MIRA_DARK, TEXT_SCALE };
