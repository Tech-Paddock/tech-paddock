import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F1F3EE",
        ink: "#1D231B",
        accent: "#55643A",
        line: "#C7CDBE",
      },
    },
  },
  plugins: [],
};

export default config;
