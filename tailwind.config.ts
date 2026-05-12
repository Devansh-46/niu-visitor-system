import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        niu: {
          navy: '#0a2540',
          deep: '#061b30',
          gold: '#d4a017',
          'gold-soft': '#f4d774',
        },
        ink: '#0a0e1a',
        paper: '#fbfaf6',
        'paper-warm': '#f5f1e8',
        line: 'rgba(10, 37, 64, 0.12)',
        'line-soft': 'rgba(10, 37, 64, 0.06)',
        muted: '#5a6473',
        success: '#2d7a3e',
        danger: '#c63838',
      },
      fontFamily: {
        sans: ['Geist', 'system-ui', 'sans-serif'],
        serif: ['Fraunces', 'Georgia', 'serif'],
        mono: ['Geist Mono', 'monospace'],
      },
      animation: {
        pulse: 'pulse 2s infinite',
      },
    },
  },
  plugins: [],
};

export default config;
