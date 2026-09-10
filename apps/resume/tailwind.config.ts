import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Aston Martin — racing green
        paper: "#EDF3F0",
        ink: "#0A1F1A",
        accent: "#00352F",
        line: "#C6D9D0",
      },
    },
  },
  plugins: [],
};

export default config;
