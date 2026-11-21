const plugin = require("tailwindcss/plugin");
const { AP_LIGHT, MIRA_DARK, TEXT_SCALE } = require("./features/mira/ui/theme-tokens.js");

/** "#161021" → "22 16 33", the form `rgb(var(--x) / <alpha-value>)` needs for `/40` to work. */
const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(" ");
const vars = (palette) =>
  Object.fromEntries(Object.entries(palette).map(([k, v]) => [`--ap-${k}`, channels(v)]));
// --mira-cloud: the welcome's cloud glows stronger on the deep plum (MiraShell.tsx MiraCloud).
const dark = { ...vars(MIRA_DARK), "--mira-cloud": "1.8", "color-scheme": "dark" };

/**
 * Mira's themes (features/mira/ui/theme-tokens.js, MiraPrefs.tsx): the ap-* colours are CSS
 * variables, light on :root, dark while a Mira page (`.mira-root`) is set to Dark, or to System
 * on a dark device. On :root (with :has) so the page behind Mira, its scrollbar and a dialog's
 * backdrop turn too. A browser without :has() keeps the light theme.
 */
const miraTheme = plugin(({ addBase }) => {
  addBase({
    ":root": vars(AP_LIGHT),
    ':root:has(.mira-root[data-mira-theme="dark"])': dark,
    "@media (prefers-color-scheme: dark)": {
      ':root:has(.mira-root[data-mira-theme="system"])': dark,
    },
    // The page behind Mira's own (the site's body is the dark landing's): the overscroll.
    "body:has(.mira-root)": { "background-color": "rgb(var(--ap-paper))" },
    // The index links in Settings jump rather than glide for anyone who asks for less motion.
    "@media (prefers-reduced-motion: reduce)": {
      "html:has(.mira-root)": { "scroll-behavior": "auto" },
    },
    ".mira-root": { "font-size": "calc(1rem * var(--mira-fs, 1))" },
    '.mira-root[data-mira-text="small"]': { "--mira-fs": String(TEXT_SCALE.small) },
    '.mira-root[data-mira-text="large"]': { "--mira-fs": String(TEXT_SCALE.large) },
    // iOS zooms into a field whose text is under 16px: Small keeps fields at their size.
    '.mira-root[data-mira-text="small"] :is(input, textarea, select)': { "--mira-fs": "1" },
  });
});

/**
 * Mira's text size: every font size inside `.mira-root` is multiplied by --mira-fs, whatever
 * component sets it, so no Mira component needs a class of its own. Outside Mira nothing changes:
 * each `text-[15px]` still gives 15px, and a named size keeps the line height Tailwind gives it.
 *
 * It answers `text-*` sizes alongside Tailwind's own: for an arbitrary size it is the one used
 * (`preferOnConflict`, or Tailwind would call the class ambiguous and drop it), so it also gives
 * the plain size, and the line height of a `text-[15px]/6`; a named size (`text-sm`) still comes
 * from Tailwind with its line height. Only px and rem scale (an em or % size follows its parent);
 * any other size is left to Tailwind alone.
 */
const miraTextSize = plugin(({ matchUtilities, theme }) => {
  const absolute = /^\d*\.?\d+(px|rem)$/;
  matchUtilities(
    {
      text: (value, { modifier }) => {
        // A named size (text-sm) is Tailwind's own [size, line height]: its plugin gives those.
        const named = Array.isArray(value);
        const size = named ? value[0] : value;
        // Anything but px or rem (em, %, clamp(), var(), a `length:` hint) stays Tailwind's
        // alone: no match here, so no conflict to resolve.
        if (!absolute.test(size)) return null;
        const scaled = {
          ":where(.mira-root) &": { "font-size": `calc(${size} * var(--mira-fs, 1))` },
        };
        if (named) return scaled;
        return { "font-size": size, ...(modifier ? { "line-height": modifier } : {}), ...scaled };
      },
    },
    {
      values: theme("fontSize"),
      modifiers: theme("lineHeight"),
      type: [
        ["absolute-size", { preferOnConflict: true }],
        ["relative-size", { preferOnConflict: true }],
        ["length", { preferOnConflict: true }],
        ["percentage", { preferOnConflict: true }],
      ],
    }
  );
});

/** @type {import('tailwindcss').Config} */
module.exports = {
  future: {
    hoverOnlyWhenSupported: true,
  },
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./features/**/*.{js,ts,jsx,tsx}",
    "./shared/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        page: "var(--color-bg)",
        surface: "var(--color-surface)",
        border: "var(--color-border)",
        text: {
          primary: "var(--color-text-primary)",
          secondary: "var(--color-text-secondary)",
          muted: "var(--color-text-muted)",
        },
        accent: {
          orange: "var(--accent-orange)",
          // Text-only; see the note on --accent-orange-ink in globals.css.
          "orange-ink": "var(--accent-orange-ink)",
          purple: "var(--accent-purple)",
        },
        // AP-Analytics (/admin/ap), the light admin area Marcus designed on 12 Oct 2026
        // (canvas "The AP-Analytics (Admin)"): the LoveIQ design system's light tokens. CSS
        // variables since 21 Nov 2026, so Mira's pages can turn dark (miraTheme above).
        ap: Object.fromEntries(
          Object.keys(AP_LIGHT)
            .filter((k) => k !== "paper")
            .map((k) => [k, `rgb(var(--ap-${k}) / <alpha-value>)`])
        ),
        // Tailwind's white is the paper colour: white everywhere, Mira's deep plum in her dark
        // theme (theme-tokens.js).
        white: "rgb(var(--ap-paper) / <alpha-value>)",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        soft: "var(--shadow-soft)",
        pill: "var(--shadow-pill)",
        ap: "0 2px 5px rgba(20,15,33,0.05)",
      },
      backgroundImage: {
        "gradient-brand": "var(--gradient-brand)",
      },
      keyframes: {
        // The landing video's play button (WHeroVideo): a soft ring that swells out of the
        // circle and fades. Tailwind's own `ping` grows to twice the size, too loud there.
        "play-pulse": {
          "0%": { transform: "scale(1)", opacity: "0.55" },
          "75%, 100%": { transform: "scale(1.45)", opacity: "0" },
        },
        // Mira (features/mira/ui): her cloud blooms in and then breathes; words resolve out of a
        // soft blur (the welcome, each new reply); the person's message rises from the composer.
        "mira-bloom": {
          "0%": { opacity: "0", scale: "0.88" },
          "100%": { opacity: "1", scale: "1" },
        },
        "mira-breathe": { "0%, 100%": { scale: "1" }, "50%": { scale: "1.06" } },
        "mira-in": {
          "0%": { opacity: "0", transform: "translateY(8px)", filter: "blur(6px)" },
          "100%": { opacity: "1", transform: "none", filter: "blur(0)" },
        },
        "mira-pop": {
          "0%": { opacity: "0", transform: "scale(0.6)", filter: "blur(4px)" },
          "100%": { opacity: "1", transform: "none", filter: "blur(0)" },
        },
        "mira-rise": {
          "0%": { opacity: "0", transform: "translateY(10px) scale(0.98)" },
          "100%": { opacity: "1", transform: "none" },
        },
        "mira-dot": {
          "0%, 60%, 100%": { transform: "translateY(0)", opacity: "0.35" },
          "30%": { transform: "translateY(-3px)", opacity: "1" },
        },
        // Two identical runs of the prompts: moving by half the track loops without a seam.
        "mira-marquee": {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        // "Use Face ID next time?" (features/mira/ui/account): a line sweeps the face mark.
        "mira-scan": {
          "0%, 100%": { transform: "translateY(10px)", opacity: "0" },
          "15%, 85%": { opacity: "1" },
          "50%": { transform: "translateY(54px)" },
        },
      },
      animation: {
        "play-pulse": "play-pulse 2.2s cubic-bezier(0, 0, 0.2, 1) infinite",
        "mira-cloud":
          "mira-bloom 1.4s cubic-bezier(0.16, 1, 0.3, 1) both, mira-breathe 12s ease-in-out 1.4s infinite",
        "mira-in": "mira-in 0.6s cubic-bezier(0.16, 1, 0.3, 1) both",
        "mira-reply": "mira-in 0.45s cubic-bezier(0.16, 1, 0.3, 1) both",
        "mira-pop": "mira-pop 0.7s cubic-bezier(0.16, 1, 0.3, 1) both",
        "mira-rise": "mira-rise 0.26s cubic-bezier(0.16, 1, 0.3, 1) both",
        "mira-dot": "mira-dot 1.1s ease-in-out infinite",
        "mira-marquee": "mira-marquee 60s linear infinite",
        // Talking to Mira (features/mira/ui/voice): her photo's halo breathes while she listens.
        "mira-listen": "mira-breathe 3.2s ease-in-out infinite",
        "mira-scan": "mira-scan 2.4s ease-in-out infinite",
      },
    },
  },
  plugins: [miraTheme, miraTextSize],
};
