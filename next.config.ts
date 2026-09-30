import type { NextConfig } from 'next';

const isGithubPages = process.env.GITHUB_PAGES === 'true';

const nextConfig: NextConfig = {
  output: isGithubPages ? 'export' : undefined,
  basePath: isGithubPages ? '/frontier-radar' : '',
  assetPrefix: isGithubPages ? '/frontier-radar/' : undefined,
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
