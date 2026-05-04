FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* 변수는 빌드 시점에 JS 번들에 박힙니다.
# Railway에서는 Build-time Variables 로 같은 이름을 노출하면 자동 전달됩니다.
ARG NEXT_PUBLIC_DEMO_MODE=false
ENV NEXT_PUBLIC_DEMO_MODE=${NEXT_PUBLIC_DEMO_MODE}
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
# Next.js standalone 서버는 PORT, HOSTNAME 환경변수를 자동 인식
CMD ["node", "server.js"]
