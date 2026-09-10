import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Scuderia Ferrari — deep red
        paper: "#F7EFEC",
        ink: "#1A1512",
        accent: "#A6051A",
        line: "#E3CFC7",
      },
    },
  },
  plugins: [],
};

export default config;
