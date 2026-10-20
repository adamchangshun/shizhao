# syntax=docker/dockerfile:1
# 实招 Shizhao — single-instance image (R3: one long-lived Node process, persistent ./data volume).
#   docker build -t shizhao .                       # default, no browser
#   docker build --build-arg WITH_QA=true -t shizhao .  # adds Playwright Chromium (optional QA layer)

FROM node:24-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm install -g pnpm@12.11.2 && npm cache clean --force
WORKDIR /app

# --- deps: compilers only live here, in case a native module has no prebuilt binary ---
FROM base AS deps
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/fact-guard/package.json packages/fact-guard/
RUN pnpm install --frozen-lockfile

# --- build ---
FROM deps AS build
COPY . .
# Backstop for .dockerignore: refuse to build if an env file (e.g. deploy/.env) got into the context.
RUN leaked="$(find . -name node_modules -prune -o -name '.env*' ! -name '.env.example' -print)" \
  && if [ -n "$leaked" ]; then echo "env files in build context: $leaked" >&2; exit 1; fi \
  && pnpm build

# --- runtime ---
FROM base AS runtime
ARG WITH_QA=false
ENV NODE_ENV=production \
  PROVIDER=mock \
  DATA_DIR=/app/data \
  PUBLIC_BASE_URL=http://localhost:6688 \
  PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
# sharp ships libvips in its prebuilt @img/sharp-linux-* package; it needs glibc and libstdc++,
# both in node:24-slim. tini reaps the image-processor children forked per upload.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates tini \
  && rm -rf /var/lib/apt/lists/*
# Whole tree on purpose: the server resolves lib/assets/processor.mjs, lib/db/migrations,
# rules/packs and node_modules (fonts, react-dom/server) from the working directory at runtime,
# and tsx (a dev dependency) runs migrations and `pnpm demo` inside the container.
COPY --from=build /app /app
RUN test -f lib/assets/processor.mjs \
  && test -d lib/db/migrations \
  && node -e "require('sharp'); require('better-sqlite3')(':memory:').close()" \
  && command -v setpriv >/dev/null \
  && if [ "$WITH_QA" = "true" ]; then pnpm exec playwright install --with-deps chromium && rm -rf /var/lib/apt/lists/*; fi \
  && chmod 755 docker/entrypoint.sh \
  && mkdir -p /app/data && chown node:node /app/data
VOLUME ["/app/data"]
EXPOSE 6688
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:6688/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--", "/app/docker/entrypoint.sh"]
