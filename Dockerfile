FROM node:22-bookworm-slim AS build

RUN apt-get update \
    && apt-get install --yes --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable \
    && corepack prepare pnpm@11 --activate
WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/docs/package.json ./apps/docs/package.json
COPY apps/board/package.json ./apps/board/package.json
COPY apps/ui-catalog/package.json ./apps/ui-catalog/package.json
COPY packages/assets/package.json ./packages/assets/package.json
COPY packages/auth/package.json ./packages/auth/package.json
COPY packages/client/package.json ./packages/client/package.json
COPY packages/eslint-config/package.json ./packages/eslint-config/package.json
COPY packages/jobs/package.json ./packages/jobs/package.json
COPY packages/logger/package.json ./packages/logger/package.json
COPY packages/orm-base/package.json ./packages/orm-base/package.json
COPY packages/orm-integration/package.json ./packages/orm-integration/package.json
COPY packages/orm-notification/package.json ./packages/orm-notification/package.json
COPY packages/orm-organization/package.json ./packages/orm-organization/package.json
COPY packages/orm/package.json ./packages/orm/package.json
COPY packages/orm-request/package.json ./packages/orm-request/package.json
COPY packages/orm-storage/package.json ./packages/orm-storage/package.json
COPY packages/types/package.json ./packages/types/package.json
COPY packages/ui/package.json ./packages/ui/package.json
COPY packages/orm-workflow/package.json ./packages/orm-workflow/package.json
RUN --mount=type=cache,id=moonwitness-pnpm-store,target=/root/.local/share/pnpm/store/v11 \
    pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
RUN pnpm --filter @moonwitness/api deploy --prod /deploy/api

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    API_HOST=0.0.0.0 \
    API_PORT=3000 \
    LOG_TO_FILE=false \
    LOG_PRETTY=false
WORKDIR /app
COPY --from=build --chown=node:node /deploy/api ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/readyz').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "dist/server.js"]

FROM build AS board-build
RUN pnpm --filter @moonwitness/board build \
    && pnpm board:budget \
    && rm -f apps/board/dist/.vite/manifest.json \
    && rmdir apps/board/dist/.vite \
    && mkdir -p /deploy/board \
    && cp -r apps/board/dist /deploy/board/dist

FROM nginx:1.30.5-alpine AS board-runtime
RUN apk upgrade --no-cache
COPY --from=board-build /deploy/board/dist /usr/share/nginx/html
COPY deploy/nginx-board.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080

FROM runtime AS api
