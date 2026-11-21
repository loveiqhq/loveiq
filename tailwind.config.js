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
        // (canvas "The AP-Analytics (Admin)"): the LoveIQ design system's light tokens.
        ap: {
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
        },
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
      },
    },
  },
  plugins: [],
};
