/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#99f7ff",
        primary_container: "#00f1fe",
        on_primary: "#001f24",
        on_primary_container: "#001f24",
        secondary: "#b2ccd0",
        secondary_container: "#1c3437",
        on_secondary: "#1d3438",
        surface: "#0c0e13",
        surface_lowest: "#000000",
        surface_low: "#0a0c10",
        surface_container_low: "#111520",
        surface_container: "#161a26",
        surface_container_high: "#1e2330",
        surface_container_highest: "#272c3a",
        surface_bright: "#2e3447",
        surface_variant: "#3a4050",
        on_surface: "#e0e6f0",
        on_surface_variant: "#9aa3b4",
        outline: "#4a5268",
        outline_variant: "#2e3447",
        neon_aura: "#99f7ff",
        teal_neon: "#99f7ff",
      },
      fontFamily: {
        display: ["Plus Jakarta Sans", "sans-serif"],
        body: ["Manrope", "sans-serif"],
        mono: ["Space Grotesk", "monospace"],
      },
      fontSize: {
        "display-lg": ["4.5rem", { lineHeight: "1.05", fontWeight: "800" }],
        "display-md": ["3.5rem", { lineHeight: "1.08", fontWeight: "800" }],
        "display-sm": ["2.75rem", { lineHeight: "1.1", fontWeight: "700" }],
        "headline-lg": ["2rem", { lineHeight: "1.15", fontWeight: "700" }],
        "headline-md": ["1.5rem", { lineHeight: "1.2", fontWeight: "600" }],
        "headline-sm": ["1.25rem", { lineHeight: "1.25", fontWeight: "600" }],
        "body-lg": ["1.125rem", { lineHeight: "1.6", fontWeight: "400" }],
        "body-md": ["1rem", { lineHeight: "1.6", fontWeight: "400" }],
        "label-lg": ["0.875rem", { lineHeight: "1.4", fontWeight: "600" }],
        "label-md": ["0.75rem", { lineHeight: "1.4", fontWeight: "600", letterSpacing: "0.08em" }],
      },
      borderRadius: {
        lg: "2rem",
        xl: "2.5rem",
        "2xl": "3rem",
      },
      spacing: {
        18: "4.5rem",
        20: "5rem",
        22: "5.5rem",
        24: "6rem",
      },
      backdropBlur: {
        glass: "40px",
        "glass-sm": "20px",
      },
      boxShadow: {
        neon: "0 0 40px 8px rgba(153, 247, 255, 0.15)",
        "neon-lg": "0 0 80px 20px rgba(153, 247, 255, 0.2)",
        "neon-card": "0 0 0 1px rgba(153, 247, 255, 0.2), 0 0 40px 8px rgba(153, 247, 255, 0.12)",
      },
      animation: {
        "liquid-pulse": "liquidPulse 3s ease-in-out infinite",
        "hero-pan": "heroPan 20s ease-in-out infinite alternate",
        "glow-breathe": "glowBreathe 4s ease-in-out infinite",
        "slide-up": "slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "fade-in": "fadeIn 0.4s ease-out forwards",
      },
      keyframes: {
        liquidPulse: {
          "0%, 100%": { transform: "scale(1)", opacity: "0.85" },
          "50%": { transform: "scale(1.15)", opacity: "1" },
        },
        heroPan: {
          "0%": { transform: "scale(1.08) translateX(0)" },
          "100%": { transform: "scale(1.08) translateX(-2%)" },
        },
        glowBreathe: {
          "0%, 100%": { boxShadow: "0 0 40px 8px rgba(153, 247, 255, 0.1)" },
          "50%": { boxShadow: "0 0 60px 16px rgba(153, 247, 255, 0.25)" },
        },
        slideUp: {
          from: { transform: "translateY(20px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
        fadeIn: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
      },
      transitionTimingFunction: {
        spring: "cubic-bezier(0.16, 1, 0.3, 1)",
        cinematic: "cubic-bezier(0.4, 0, 0.2, 1)",
      },
    },
  },
  plugins: [],
};
