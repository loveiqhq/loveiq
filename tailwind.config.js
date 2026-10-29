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
      },
      animation: {
        "play-pulse": "play-pulse 2.2s cubic-bezier(0, 0, 0.2, 1) infinite",
      },
    },
  },
  plugins: [],
};
