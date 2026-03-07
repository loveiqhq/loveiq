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
        border: "var(--color-border)",
        text: {
          primary: "var(--color-text-primary)",
          secondary: "var(--color-text-secondary)",
          muted: "var(--color-text-muted)",
        },
        accent: {
          orange: "var(--accent-orange)",
          purple: "var(--accent-purple)",
        },
      },
      borderRadius: {
        pill: "9999px",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        soft: "var(--shadow-soft)",
        pill: "var(--shadow-pill)",
        focus:
          "0 0 0 2px var(--color-border-strong), 0 0 0 4px color-mix(in srgb, var(--accent-purple) 40%, transparent)",
      },
      backgroundImage: {
        "gradient-brand": "var(--gradient-brand)",
        "gradient-surface": "var(--gradient-surface)",
      },
    },
  },
  plugins: [],
};
