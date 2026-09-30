import type { NextConfig } from 'next';

const isGithubPages = process.env.GITHUB_PAGES === 'true';

const nextConfig: NextConfig = {
  output: isGithubPages ? 'export' : undefined,
  // Vinext prerenders the root route at `/`; only the generated assets need
  // GitHub Pages' repository prefix.
  assetPrefix: isGithubPages ? '/frontier-radar' : undefined,
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
