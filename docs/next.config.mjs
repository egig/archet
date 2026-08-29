import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  output: 'export',
  reactStrictMode: true,
  basePath: '/ratchet',
  trailingSlash: true,
  images: { unoptimized: true },
};

export default withMDX(config);
