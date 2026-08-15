import type { Config } from 'tailwindcss';

// Tailwind is used for LAYOUT ONLY (flex/grid/spacing/position) per §8 —
// the neobrutalist visual language (borders, shadows, colour, type) lives in
// src/styles/tokens.css as hand-written CSS, not utility classes. We disable
// Tailwind's own color/shadow/rounded scales so nobody reaches for
// `rounded-md` or `shadow-lg` by habit — border-radius is 0 everywhere and
// shadows are hard offsets defined as tokens.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    borderRadius: {
      none: '0px',
      full: '9999px', // only for the rare true circle (avatars, dots)
    },
    boxShadow: {
      none: 'none',
    },
    extend: {
      fontFamily: {
        display: ['"Archivo Black"', 'sans-serif'],
        body: ['"Space Grotesk"', 'sans-serif'],
      },
    },
  },
  corePlugins: {
    // Disable Tailwind's own color-driven utilities that would compete with
    // the token layer.
    boxShadow: false,
    gradientColorStops: false,
  },
  plugins: [],
} satisfies Config;
