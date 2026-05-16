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
    // Server Actions are enabled by default in 14.x.
    //
    // Next.js 14 traces only the files reachable through imports when it
    // bundles a serverless function. Static assets in `public/` are
    // served by the edge layer and are NOT included in the lambda
    // working dir by default — so `fs.readFile(process.cwd() +
    // '/public/...')` from /api/image throws ENOENT on Vercel. We
    // explicitly include the character reference photos so the selfie
    // generator can read them off disk without going through HTTP (and
    // without depending on NEXT_PUBLIC_APP_URL being correctly set).
    outputFileTracingIncludes: {
      // After image compression, references shipped as .jpg (PNG was
      // too heavy for the lambda bundle). Glob both so we don't break
      // if someone re-introduces a PNG reference later.
      '/api/image': ['./public/reference/*.jpg', './public/reference/*.png'],
    },
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
