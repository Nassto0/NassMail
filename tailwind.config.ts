import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        nass: {
          50: "#eef4ff",
          100: "#dbe6ff",
          200: "#bdd1ff",
          300: "#90b1ff",
          400: "#5b86ff",
          500: "#345fff",
          600: "#1f3ff5",
          700: "#1a2fd9",
          800: "#1b2aaf",
          900: "#1c2a89",
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Inter", "sans-serif"],
      },
      boxShadow: {
        soft: "0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.06)",
        pop: "0 10px 30px rgba(16,24,40,.12)",
      },
    },
  },
  plugins: [],
};
export default config;
