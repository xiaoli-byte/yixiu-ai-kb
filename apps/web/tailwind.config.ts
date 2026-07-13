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
        // 语义色，对应 globals.css :root 中的 CSS 变量
        surface: "rgb(var(--surface) / <alpha-value>)",
        "surface-muted": "rgb(var(--surface-muted) / <alpha-value>)",
        ai: "rgb(var(--ai) / <alpha-value>)",
        "ai-surface": "rgb(var(--ai-surface) / <alpha-value>)",
        success: "rgb(var(--success) / <alpha-value>)",
        warning: "rgb(var(--warning) / <alpha-value>)",
        destructive: "rgb(var(--destructive) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "monospace"],
      },
      boxShadow: {
        soft: "0 6px 24px -8px rgba(15, 23, 42, 0.12)", // 兼容别名，保留
        card: "0 1px 2px rgba(15, 23, 42, 0.05)",
        raised: "0 6px 24px -8px rgba(15, 23, 42, 0.12)",
        modal: "0 24px 48px -12px rgba(15, 23, 42, 0.25)",
      },
    },
  },
  plugins: [],
};

export default config;