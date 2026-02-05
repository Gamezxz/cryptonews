/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  distDir: 'output',
  images: {
    unoptimized: true
  },
  trailingSlash: true,
  skipTrailingSlashRedirect: true
};

export default nextConfig;
