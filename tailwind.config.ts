import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx,js,jsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Theme tokens — resolved from CSS variables in globals.css.
        // Swap the `.theme-light` / `.theme-dark` class on <html> to retheme.
        bg: "var(--color-bg)",
        surface: "var(--color-surface)",
        "surface-2": "var(--color-surface-2)",
        border: "var(--color-border)",

        text: "var(--color-text)",
        muted: "var(--color-muted)",

        // Brand accents — constant across themes so the tricolor keeps its identity.
        accent: "var(--color-accent)",
        "accent-hover": "var(--color-accent-hover)",

        "accent-blue": "var(--color-accent-blue)",
        "accent-blue-hover": "var(--color-accent-blue-hover)",

        live: "var(--color-live)",
        "accent-red": "var(--color-accent-red)",
        "accent-red-hover": "var(--color-accent-red-hover)",

        cream: "var(--color-cream)",

        // Text ink that sits on brand-accent buttons (dark in both themes).
        "on-accent": "var(--color-on-accent)",

        // Error / destructive-action semantic tokens — theme-aware.
        danger: "var(--color-danger)",
        "danger-bg": "var(--color-danger-bg)",
        "danger-border": "var(--color-danger-border)",
        "danger-hover-bg": "var(--color-danger-hover-bg)",

      },
      fontFamily: {
        sans: [
          "var(--font-body)",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
        display: [
          "var(--font-display)",
          "Impact",
          "Bebas Neue",
          "system-ui",
          "sans-serif",
        ],
      },
      boxShadow: {
        retro: "0 2px 0 0 var(--color-shadow-retro), 0 4px 0 0 var(--color-accent-red)",
        "retro-sm": "0 2px 0 0 var(--color-shadow-retro)",
      },
      backgroundImage: {
        /** Blue → orange → red (matches wordmark colors, different order than retro-sunset) */
        "retro-tricolor":
          "linear-gradient(135deg, var(--retro-blue) 0%, var(--retro-orange) 50%, var(--retro-red) 100%)",
        "retro-sunset":
          "linear-gradient(135deg, var(--retro-orange) 0%, var(--retro-red) 50%, var(--retro-blue) 100%)",
        "retro-stripes":
          "repeating-linear-gradient(135deg, rgba(226,158,75,0.08) 0 14px, transparent 14px 28px)",
      },
    },
  },
  plugins: [],
};

export default config;
