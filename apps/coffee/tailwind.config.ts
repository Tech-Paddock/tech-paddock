import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // McLaren — papaya
        paper: "#FBF4EC",
        ink: "#1A1512",
        accent: "#FF8000",
        line: "#EBD8C2",
      },
    },
  },
  plugins: [],
};

export default config;
