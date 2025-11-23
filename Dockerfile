# syntax=docker/dockerfile:1.8

ARG NODE_VERSION=20
FROM node:${NODE_VERSION}-bookworm AS base
ENV CI="true"
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci \
 && npm install --no-save \
    lightningcss-linux-x64-gnu \
    @tailwindcss/oxide-linux-x64-gnu

FROM deps AS builder
COPY . .
RUN --mount=type=secret,id=env \
    sed 's/\r$//' /run/secrets/env > /tmp/env && \
    set -a && . /tmp/env && set +a && \
    BUILD_STANDALONE=true npm run build
RUN npm prune --omit=dev \
 && npm install --no-save typescript@5.9.3

FROM node:${NODE_VERSION}-bookworm-slim AS runner
ENV NODE_ENV=production \
    PORT=8080 \
    NEXT_TELEMETRY_DISABLED=1 \
    PDFLATEX_COMMAND=pdflatex

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
    texlive-full \
    poppler-utils \
    ghostscript \
    fonts-noto \
    fonts-lmodern \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/public ./public
COPY --from=builder /app/source_files ./source_files

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 8080
USER node
CMD ["node", "server.js"]
