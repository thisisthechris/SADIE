/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Plymouth Culture brand palette — CSS-variable driven for light/dark theming.
        bg: "rgb(var(--bg) / <alpha-value>)",
        fg: "rgb(var(--fg) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        card: "rgb(var(--card) / <alpha-value>)",
        border: "rgb(var(--border) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        // Secondary Plymouth Culture brand tokens (always the same in both themes).
        mint: "rgb(var(--mint) / <alpha-value>)",
        amber: "rgb(var(--amber) / <alpha-value>)",
        "light-blue": "rgb(var(--light-blue) / <alpha-value>)",
      },
      fontFamily: {
        // "obviously" substitute: Barlow Condensed (bold condensed grotesque)
        display: ["Barlow Condensed", "ui-sans-serif", "sans-serif"],
        // "basic-sans" substitute: Plus Jakarta Sans (clean geometric sans)
        sans: ["Plus Jakarta Sans", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      boxShadow: {
        soft: "0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 3px 0 rgb(0 0 0 / 0.06)",
      },
    },
  },
  plugins: [],
};
