import type { NextConfig } from 'next';

const repoBase = process.env.GITHUB_ACTIONS ? '/wardrobe-studio' : '';
const nextConfig: NextConfig = {
  output: 'export',
  images: { unoptimized: true },
  basePath: repoBase,
  assetPrefix: repoBase || undefined,
};

export default nextConfig;
