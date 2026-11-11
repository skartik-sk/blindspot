# The static web app, built for a given relay URL. Used by docker-compose.yml (served by Caddy).
FROM oven/bun:1.3 AS build
WORKDIR /app
COPY package.json bun.lock tsconfig.base.json ./
COPY packages/sdk/package.json packages/sdk/
COPY apps/relay/package.json apps/relay/
COPY apps/web/package.json apps/web/
RUN bun install --frozen-lockfile
COPY packages packages
COPY apps/web apps/web
ARG VITE_RELAY_URL
ENV VITE_RELAY_URL=$VITE_RELAY_URL
RUN cd apps/web && bun run build -- --base /

FROM caddy:2.8-alpine
COPY --from=build /app/apps/web/dist /srv
COPY deploy/Caddyfile /etc/caddy/Caddyfile
