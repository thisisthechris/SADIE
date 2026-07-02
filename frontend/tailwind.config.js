/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
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
        pink: "rgb(var(--pink) / <alpha-value>)",
        "light-blue": "rgb(var(--light-blue) / <alpha-value>)",
      },
      fontFamily: {
        // Basic Sans from Adobe Fonts
        sans: ["basic-sans", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
        display: ["basic-sans", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      fontSize: {
        // Typography scale based on pt conversions (1pt ≈ 1.333px)
        // Main heading: 80pt / 80pt leading
        "heading-main": ["5.33rem", { lineHeight: "5.33rem", fontWeight: "700", color: "rgb(var(--light-blue))" }],
        // Small heading: 30pt / 90pt leading
        "heading-small": ["2rem", { lineHeight: "6rem", fontWeight: "700", color: "rgb(var(--light-blue))" }],
        // Subheading: 30pt / 40pt leading, uppercase, bold, black
        "heading-sub": ["2rem", { lineHeight: "2.67rem", fontWeight: "700", textTransform: "uppercase", color: "rgb(var(--fg))" }],
        // Body copy: 24pt / 30pt leading, regular weight
        "body-lg": ["1.6rem", { lineHeight: "2rem", fontWeight: "400" }],
        // Body light (for normal text)
        "body-regular": ["1.6rem", { lineHeight: "2rem", fontWeight: "300" }],
      },
      fontWeight: {
        light: "300",
        normal: "400",
        medium: "500",
        semibold: "600",
        bold: "700",
      },
      boxShadow: {
        soft: "0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 3px 0 rgb(0 0 0 / 0.06)",
      },
      animation: {
        "fade-in": "fadeIn 0.4s ease-in-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0", transform: "scale(0.95)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
      },
    },
  },
  plugins: [],
};
