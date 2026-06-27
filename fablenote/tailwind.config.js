/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        base:           "var(--color-base)",
        sidebar:        "var(--color-sidebar)",
        panel:          "var(--color-panel)",
        hover:          "var(--color-hover)",
        active:         "var(--color-active)",
        border:         "var(--color-border)",
        muted:          "var(--color-muted)",
        secondary:      "var(--color-secondary)",
        primary:        "var(--color-primary)",
        accent:         "var(--color-accent)",
        "accent-hover": "var(--color-accent-hover)",
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
    },
  },
  plugins: [],
};
