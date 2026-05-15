import type { Config } from 'tailwindcss';
import wiPreset from '@wi/ui/tailwind-preset';

const config: Config = {
  presets: [wiPreset],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: { extend: {} },
  plugins: [],
};

export default config;
