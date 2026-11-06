# Relay image (Railway, fly.io, any container host). Build from the repo root: docker build -t bina-relay .
FROM oven/bun:1.3-slim
WORKDIR /app
COPY package.json bun.lock ./
COPY packages/sdk/package.json packages/sdk/
COPY apps/relay/package.json apps/relay/
COPY apps/web/package.json apps/web/
RUN bun install --frozen-lockfile --production --filter '@bina/relay'
COPY packages/sdk/src packages/sdk/src
COPY apps/relay/src apps/relay/src
ENV PORT=8080 TRUST_PROXY=1
EXPOSE 8080
USER bun
CMD ["bun", "apps/relay/src/server.ts"]
