import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Oracle Red Bull Racing
        paper: "#EEF1FB",
        ink: "#10132B",
        accent: "#1E3A8A",
        line: "#C9D0EC",
      },
    },
  },
  plugins: [],
};

export default config;
