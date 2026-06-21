import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef6ff",
          100: "#d9eaff",
          200: "#bcdaff",
          300: "#8ec2ff",
          400: "#599fff",
          500: "#3079ff",
          600: "#1d59f5",
          700: "#1a47e0",
          800: "#1c3cb4",
          900: "#1d388e",
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "monospace"],
      },
      boxShadow: {
        soft: "0 6px 24px -8px rgba(15, 23, 42, 0.12)",
      },
    },
  },
  plugins: [],
};

export default config;