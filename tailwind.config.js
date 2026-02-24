/** @type {import('tailwindcss').Config} */
module.exports = {
  future: {
    hoverOnlyWhenSupported: true,
  },
  darkMode: "class",
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        page: "var(--color-bg)",
        surface: "var(--color-surface)",
        card: "var(--color-card)",
        panel: "var(--color-panel)",
        border: "var(--color-border)",
        text: {
          primary: "var(--color-text-primary)",
          secondary: "var(--color-text-secondary)",
          muted: "var(--color-text-muted)",
        },
        accent: {
          orange: "var(--accent-orange)",
          peach: "var(--accent-peach)",
          purple: "var(--accent-purple)",
          indigo: "var(--accent-indigo)",
        },
      },
      borderRadius: {
        card: "var(--radius-card)",
        pill: "9999px",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        soft: "var(--shadow-soft)",
        pill: "var(--shadow-pill)",
        focus:
          "0 0 0 2px var(--color-border-strong), 0 0 0 4px color-mix(in srgb, var(--accent-purple) 40%, transparent)",
      },
      spacing: {
        section: "var(--space-section)",
        gutter: "var(--space-gutter)",
      },
      backgroundImage: {
        "gradient-brand": "var(--gradient-brand)",
        "gradient-surface": "var(--gradient-surface)",
      },
    },
  },
  plugins: [],
};
