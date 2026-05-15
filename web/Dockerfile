FROM node:22-alpine AS sdk-builder
WORKDIR /sdk
COPY sdk/package.json sdk/package-lock.json* ./
RUN npm ci
COPY sdk/ .
RUN npm run build

FROM node:22-alpine AS builder
WORKDIR /app

# Copy SDK build output so file:../sdk resolves correctly
COPY --from=sdk-builder /sdk /sdk

# Install web dependencies (file:../sdk resolves to /sdk)
COPY web/package.json web/package-lock.json* ./
RUN npm ci

# Copy web source and build
COPY web/ .
RUN npm run build

# ── Production stage ────────────────────────────────────────────
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
