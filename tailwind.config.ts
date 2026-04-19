import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx,js,jsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Retro CRT navy base
        bg: "#0b1d2e",
        surface: "#13314f",
        "surface-2": "#1b4066",
        border: "#2b4c6e",

        // Warm cream foreground
        text: "#f7e9c9",
        muted: "#b6a784",

        // Sunset orange — primary action
        accent: "#ff8c3a",
        "accent-hover": "#ffa55b",

        // Retro sky blue — secondary accent
        "accent-blue": "#5eb1f2",
        "accent-blue-hover": "#86c5f6",

        // Signal red — live + alerts
        live: "#e23d3d",
        "accent-red": "#e23d3d",
        "accent-red-hover": "#f25454",

        // Nostalgia cream (for highlighted chips)
        cream: "#f7e9c9",
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
        retro: "0 2px 0 0 #0b1d2e, 0 4px 0 0 #e23d3d",
        "retro-sm": "0 2px 0 0 #0b1d2e",
      },
      backgroundImage: {
        /** Blue → orange → red (matches wordmark colors, different order than retro-sunset) */
        "retro-tricolor":
          "linear-gradient(135deg, #5eb1f2 0%, #ff8c3a 50%, #e23d3d 100%)",
        "retro-sunset":
          "linear-gradient(135deg, #ff8c3a 0%, #e23d3d 50%, #5eb1f2 100%)",
        "retro-stripes":
          "repeating-linear-gradient(135deg, rgba(255,140,58,0.08) 0 14px, transparent 14px 28px)",
      },
    },
  },
  plugins: [],
};

export default config;
