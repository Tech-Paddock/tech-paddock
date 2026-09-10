import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Scuderia Ferrari
        paper: "#F7EFEC",
        ink: "#1A1512",
        accent: "#DC0000",
        line: "#E3CFC7",
      },
    },
  },
  plugins: [],
};

export default config;
