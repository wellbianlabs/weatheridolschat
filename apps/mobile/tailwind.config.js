const wiPreset = require('@wi/ui/tailwind-preset');

/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [wiPreset],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: { extend: {} },
  plugins: [],
};
