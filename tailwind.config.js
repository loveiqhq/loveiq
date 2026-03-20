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
      boxShadow: {
        card: "var(--shadow-card)",
        soft: "var(--shadow-soft)",
        pill: "var(--shadow-pill)",
      },
      backgroundImage: {
        "gradient-brand": "var(--gradient-brand)",
      },
    },
  },
  plugins: [],
};
