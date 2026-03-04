import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#0f1117",
          raised: "#1a1d27",
          border: "#2a2d3a",
        },
        brand: {
          DEFAULT: "#6366f1",
          hover: "#818cf8",
          muted: "#312e81",
        },
      },
      typography: {
        invert: {
          css: {
            "--tw-prose-body": "#d1d5db",
            "--tw-prose-headings": "#f9fafb",
            "--tw-prose-code": "#a5b4fc",
            "--tw-prose-pre-bg": "#1e2030",
          },
        },
      },
    },
  },
  plugins: [],
};

export default config;
