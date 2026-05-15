/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@wi/core',
    '@wi/ui',
    '@wi/ai',
    '@wi/db',
    '@wi/weather',
    '@wi/analytics',
    '@wi/config',
  ],
  experimental: {
    // Server Actions are enabled by default in 14.x
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: 'picsum.photos' },
      { protocol: 'https', hostname: 'fastly.picsum.photos' },
    ],
  },
};

export default nextConfig;
