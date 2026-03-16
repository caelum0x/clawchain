# ── OpenClaw build stage (Node 22, pnpm) ──────────────────────
FROM node:22-alpine AS openclaw-builder
WORKDIR /openclaw
RUN npm install -g pnpm@10
COPY openclaw/package.json openclaw/pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile || pnpm install
COPY openclaw/ .
RUN pnpm run build

# ── clawd build stage ─────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

# Install dependencies
COPY cmd/clawd/package.json cmd/clawd/pnpm-lock.yaml* cmd/clawd/package-lock.json* ./
RUN if [ -f pnpm-lock.yaml ]; then \
      npm install -g pnpm && pnpm install --frozen-lockfile; \
    elif [ -f package-lock.json ]; then \
      npm ci; \
    else \
      npm install; \
    fi

# Copy source and build
COPY cmd/clawd/ .
RUN if [ -f pnpm-lock.yaml ]; then \
      pnpm run build; \
    else \
      npm run build; \
    fi

# ── Production stage ──────────────────────────────────────────
FROM node:22-alpine
WORKDIR /app

# Install production dependencies only
COPY cmd/clawd/package.json cmd/clawd/pnpm-lock.yaml* cmd/clawd/package-lock.json* ./
RUN if [ -f pnpm-lock.yaml ]; then \
      npm install -g pnpm && pnpm install --frozen-lockfile --prod; \
    elif [ -f package-lock.json ]; then \
      npm ci --production; \
    else \
      npm install --production; \
    fi

# Copy clawd built artifacts
COPY --from=builder /app/dist/ ./dist/
COPY cmd/clawd/clawd.mjs ./

# Copy openclaw built artifacts
COPY --from=openclaw-builder /openclaw/openclaw.mjs /opt/openclaw/openclaw.mjs
COPY --from=openclaw-builder /openclaw/dist/ /opt/openclaw/dist/
COPY --from=openclaw-builder /openclaw/node_modules/ /opt/openclaw/node_modules/
COPY --from=openclaw-builder /openclaw/package.json /opt/openclaw/package.json

# Tell clawd where to find openclaw
ENV CLAWD_OPENCLAW_BIN=/opt/openclaw/openclaw.mjs

# Entrypoint removes stale lock files left by crashed containers
COPY cmd/clawd/docker-entrypoint.sh /usr/local/bin/clawd-entrypoint.sh
RUN chmod +x /usr/local/bin/clawd-entrypoint.sh

EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/clawd-entrypoint.sh"]
CMD ["up"]
