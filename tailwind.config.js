const plugin = require("tailwindcss/plugin");
const { AP_LIGHT, MIRA_DARK, TEXT_SCALE } = require("./features/mira/ui/theme-tokens.js");

/** "#161021" → "22 16 33", the form `rgb(var(--x) / <alpha-value>)` needs for `/40` to work. */
const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(" ");
const vars = (palette) =>
  Object.fromEntries(Object.entries(palette).map(([k, v]) => [`--ap-${k}`, channels(v)]));
// --mira-cloud: the welcome's cloud glows stronger on the deep plum (MiraShell.tsx MiraCloud).
const dark = { ...vars(MIRA_DARK), "--mira-cloud": "1.8", "color-scheme": "dark" };
/** The phone's bottom bar (MiraAppFrame) at Default text, in px. */
const BAR = 60;
/** Mira's focus ring (ui/kit FOCUS_RING draws the same). */
const RING = "2px solid rgb(var(--ap-purple))";

/**
 * Mira's themes (features/mira/ui/theme-tokens.js, MiraPrefs.tsx): the ap-* colours are CSS
 * variables, light on :root, dark while a Mira page (`.mira-root`) is set to Dark, or to System
 * on a dark device. On :root (with :has) so the page behind Mira, its scrollbar and a dialog's
 * backdrop turn too. A browser without :has() keeps the light theme.
 */
const miraTheme = plugin(({ addBase }) => {
  addBase({
    // --mira-bar: the phone bar's height, here so the page's focus room below (further down) and
    // the bar read one value. It grows with Large text and never shrinks with Small, so each of
    // its places stays 52px tall (round-3 R3-UXA-4: 60px × 0.9 left them 47px).
    ":root": { ...vars(AP_LIGHT), "--mira-bar": `${BAR}px` },
    ':root:has(.mira-root[data-mira-text="large"])': {
      "--mira-bar": `${Math.round(BAR * TEXT_SCALE.large)}px`,
    },
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
    // Keyboard focus never lands under the phone's bar (round-3 R3-UXA-1, WCAG 2.4.11): the page
    // scrolls a focused control clear of the bar, its safe area and a cookie banner it stands on,
    // with room for the focus ring. The root scroller only, so lists that scroll inside a page
    // keep their own edges.
    "@media not all and (min-width: 1024px)": {
      ":root:has([data-mira-bar])": {
        "scroll-padding-bottom":
          "calc(var(--mira-bar) + env(safe-area-inset-bottom) + var(--liq-consent-h, 0px) + 8px)",
      },
    },
    // The same for a sticky header: a page sets --mira-scroll-top (the header's height and a
    // little air) on what scrolls under it, never on the header itself, and focus and jumps
    // there stop below it. No weight of its own, so a scroll-mt-* class still wins.
    ":where(.mira-root) *": { "scroll-margin-top": "var(--mira-scroll-top, 0px)" },
    // One focus style (round-3 R3-UXA-3): Mira's 2px purple ring, 3:1 or more in both themes, on
    // any control that brings none of its own. The browser's default changed colour by browser
    // and theme, and all but vanished on the ink pill in Dark. No weight of its own, so
    // outline-none and a component's own focus classes still win.
    ":where(.mira-root) :focus-visible": { outline: RING, "outline-offset": "2px" },
    // Inside a sideways scroller the ring is drawn inside the control: the scroller cut the top
    // and bottom off a ring outside it (the chat's prompts, the coaches' filters).
    ".mira-root .overflow-x-auto :focus-visible": { "outline-offset": "-2px" },
    // The site's skip link sits outside .mira-root; on Mira's pages it takes her ring too.
    ':root:has(.mira-root) a[href="#main-content"]:focus-visible': {
      outline: RING,
      "outline-offset": "2px",
    },
    // A text field (R3-UXA-5) gets the ring hugging its edge: its edge turning purple alone was a
    // 1.4:1 change in Light. A borderless field in a bordered box (the chat's composer) rings the
    // box, in a rule of its own so a browser without :has() still rings the fields.
    ".mira-root :is(input:not([type=checkbox], [type=radio], [type=range]), textarea, select).border:focus-visible":
      { outline: RING, "outline-offset": "0px" },
    ".mira-root .border:has(> textarea:not(.border):focus-visible)": {
      outline: RING,
      "outline-offset": "0px",
    },
    // Home's sections (MiraHome, round-3 audit): one anatomy whichever card fills them, the
    // heading and then the content on the page itself, boxes only around things (the check-in,
    // a coach, a voice session). The cards drew it three ways (a box with the heading inside, the
    // heading over a box, no box), so Home lays them out: a card's own outer box goes, and its
    // one h2 is a section heading, Lora 24px like "Daily journal".
    ".mira-home-sections > section": {
      "border-width": "0",
      "border-radius": "0",
      padding: "0",
      margin: "0",
      background: "none",
    },
    ".mira-home-sections > section > h2, .mira-home-sections > section > div:first-child h2": {
      "font-size": "calc(24px * var(--mira-fs, 1))",
      "font-weight": "500",
      "line-height": "1.25",
    },
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
      // Lora, as globals.css gives `.font-serif` and the headings: without it a variant such as
      // `[&_h2]:font-serif` (the guide, the privacy notice) fell back to Tailwind's Georgia stack.
      fontFamily: { serif: ['var(--font-serif, "Lora", "Times New Roman", serif)'] },
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
        // Talking to Mira (features/mira/ui/voice): her photo's halo breathes while she listens.
        "mira-listen": "mira-breathe 3.2s ease-in-out infinite",
        "mira-scan": "mira-scan 2.4s ease-in-out infinite",
      },
    },
  },
  plugins: [miraTheme, miraTextSize],
};
