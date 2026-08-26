import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        studio: {
          bg: "#f5f5f3",
          ink: "#111111",
        },
        admin: {
          ink: "#111827",
          canvas: "#f5f6f8",
          surface: "#ffffff",
          border: "rgba(17,24,39,0.08)",
          "border-strong": "rgba(17,24,39,0.14)",
          muted: "rgba(17,24,39,0.5)",
          faint: "rgba(17,24,39,0.35)",
        },
      },
    },
  },
  plugins: [],
};

export default config;