ARG BUN_VERSION=1.3.14

FROM oven/bun:${BUN_VERSION}-slim AS source
WORKDIR /app
COPY . .

FROM source AS build
RUN bun install --frozen-lockfile
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run build:web

FROM source AS production
RUN bun install --frozen-lockfile --production
ENV NODE_ENV=production
USER bun

FROM production AS web
COPY --from=build --chown=bun:bun /app/apps/web/.next /app/apps/web/.next
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
EXPOSE 3000
CMD ["bun", "run", "--cwd", "apps/web", "start"]

FROM production AS api
ENV PORT=3001
EXPOSE 3001
CMD ["bun", "run", "--cwd", "apps/api", "start"]

FROM production AS worker
CMD ["bun", "run", "--cwd", "apps/worker", "start"]

FROM production AS migration
CMD ["bun", "run", "--cwd", "packages/db", "migrate"]
