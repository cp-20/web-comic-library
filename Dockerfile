ARG BUN_VERSION=1.3.14

FROM oven/bun:${BUN_VERSION}-slim AS source
RUN apt-get update \
  && apt-get upgrade --yes --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .

FROM source AS build
RUN bun install --frozen-lockfile
ARG SENTRY_DSN
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_SENTRY_DSN=${SENTRY_DSN}
ENV SENTRY_DSN=${SENTRY_DSN}
RUN bun run build:web

FROM source AS production
RUN bun install --frozen-lockfile --production
ENV NODE_ENV=production
LABEL org.opencontainers.image.source="https://github.com/cp-20/web-comic-library"
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

FROM postgres:16 AS database
ADD --checksum=sha256:f30544c5ce93cf83b87578e3c4a2e9c0e0ffc3d160ef89ecddaf75f397d98deb \
  https://github.com/wal-g/wal-g/releases/download/v3.0.8/wal-g-pg-22.04-amd64 \
  /usr/local/bin/wal-g
COPY --chmod=755 operations/logical-backup.sh /usr/local/bin/logical-backup
RUN apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && chmod 755 /usr/local/bin/wal-g
LABEL org.opencontainers.image.source="https://github.com/cp-20/web-comic-library"
USER postgres
