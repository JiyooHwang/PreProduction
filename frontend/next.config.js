/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: {
    proxyTimeout: 30 * 60 * 1000,
  },
  // 백엔드 프록시는 src/app/api/backend/[...path]/route.ts 에서 처리.
  // (Next.js standalone 빌드에서 rewrites 가 빌드타임에 평가되어 BACKEND_URL 이
  //  안 박히는 케이스가 있어 API 라우트로 대체)
};
module.exports = nextConfig;
