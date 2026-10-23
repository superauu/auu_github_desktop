/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontSize: { xs: ['13px', '1.5'], sm: ['14px', '1.5'] },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
        },
        git: {
          added: "hsl(var(--git-added))",
          modified: "hsl(var(--git-modified))",
          deleted: "hsl(var(--git-deleted))",
          renamed: "hsl(var(--git-renamed))",
          untracked: "hsl(var(--git-untracked))",
          branch: "hsl(var(--git-branch))",
          tag: "hsl(var(--git-tag))",
          commit: "hsl(var(--git-commit))",
        },
        neon: {
          cyan: "#00e5ff",
          pink: "#ff2ea6",
          green: "#00ff9c",
          amber: "#ffb300",
          purple: "#b26bff",
        }
      },
      boxShadow: {
        "neon-sm": "0 0 8px rgba(0, 229, 255, 0.28)",
        neon: "0 0 16px rgba(0, 229, 255, 0.30), 0 0 2px rgba(0, 229, 255, 0.55)",
        "neon-pink": "0 0 16px rgba(255, 46, 166, 0.30), 0 0 2px rgba(255, 46, 166, 0.5)",
        "neon-green": "0 0 14px rgba(0, 255, 156, 0.30)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(2px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-subtle": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" },
        }
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.15s ease-out",
        "pulse-subtle": "pulse-subtle 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
      fontFamily: {
        display: [
          'Orbitron Variable',
          'Inter Variable',
          'sans-serif',
        ],
        sans: [
          'Inter Variable',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          '"PingFang SC"',
          '"HarmonyOS Sans SC"',
          '"Microsoft YaHei UI"',
          '"Microsoft YaHei"',
          'sans-serif',
        ],
        mono: [
          '"JetBrains Mono Variable"',
          '"Cascadia Mono"',
          '"Cascadia Code"',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          'monospace',
        ],
      },
    },
  },
  plugins: [],
};
