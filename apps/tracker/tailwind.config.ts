import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Mercedes-AMG — Silver Arrows
        paper: "#F1F2F3",
        ink: "#121314",
        accent: "#6E7175",
        line: "#D4D6D8",
      },
    },
  },
  plugins: [],
};

export default config;
