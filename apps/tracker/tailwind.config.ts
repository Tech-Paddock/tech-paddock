import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Mercedes-AMG Petronas
        paper: "#EEF6F5",
        ink: "#0B1211",
        accent: "#00A19C",
        line: "#C7E0DD",
      },
    },
  },
  plugins: [],
};

export default config;
