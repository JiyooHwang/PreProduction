/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: {
    proxyTimeout: 30 * 60 * 1000,
  },
  // 백엔드 호출을 Next.js 서버를 통해 프록시.
  // → 클라우드플레어 터널 등으로 프런트만 노출하면 백엔드도 같은 도메인으로 자동 공개.
  async rewrites() {
    const backend = process.env.BACKEND_URL || "http://backend:8000";
    return [
      // /api/backend/api/me  →  http://backend:8000/api/me
      {
        source: "/api/backend/:path*",
        destination: `${backend}/:path*`,
      },
    ];
  },
};
module.exports = nextConfig;
