/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: {
    proxyTimeout: 30 * 60 * 1000,
  },
};
module.exports = nextConfig;
