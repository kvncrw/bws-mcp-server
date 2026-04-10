# syntax=docker/dockerfile:1.7
# bws-mcp-server — Debian-based image.
#
# We install the bws binary at build time, then build the TypeScript
# server. Runtime is non-root. No Alpine anywhere.

FROM node:22-bookworm-slim AS builder
WORKDIR /app

# Install build-time deps for TypeScript compilation.
COPY package.json package-lock.json* tsconfig.json ./
RUN npm install --no-audit --no-fund

COPY src ./src
RUN npm run build

FROM node:22-bookworm-slim AS runtime

# Install bws from the official Bitwarden releases.
ARG BWS_VERSION=1.0.0
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl unzip \
    && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL "https://github.com/bitwarden/sdk-sm/releases/download/bws-v${BWS_VERSION}/bws-x86_64-unknown-linux-gnu-${BWS_VERSION}.zip" -o /tmp/bws.zip \
    && unzip -q /tmp/bws.zip -d /usr/local/bin \
    && chmod +x /usr/local/bin/bws \
    && rm /tmp/bws.zip

# Non-root user.
RUN useradd --create-home --shell /bin/bash bwsmcp
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./

USER bwsmcp
ENTRYPOINT ["node", "dist/index.js"]
