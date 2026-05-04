# Dockerfile
#
# Node 20 + full Chromium dependency set for Puppeteer.
# Puppeteer downloads its own Chromium at npm install time.
# These system packages are the OS-level requirements for that Chromium build.
#
# Chromium deps reference: https://pptr.dev/troubleshooting#chrome-doesnt-launch-on-linux
#
# Note: libappindicator3-1 is intentionally omitted — it was removed from
# Debian Bookworm. All packages below are confirmed available in node:20-bookworm-slim.

FROM node:20-bookworm-slim

# ── Puppeteer / Chromium system dependencies ─────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgdk-pixbuf2.0-0 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# ── App setup ─────────────────────────────────────────────────────────────────
WORKDIR /app

# Install dependencies first (layer is cached when package.json is unchanged)
COPY package*.json ./
RUN npm ci

# Copy source (config/, drafts/, data/ are bind-mounted at runtime via compose)
COPY src/ ./src/
COPY scripts/ ./scripts/
COPY templates/ ./templates/
COPY tsconfig.json ./
COPY CLAUDE.md ./

# Create runtime directories (overwritten by bind mounts when using docker compose)
RUN mkdir -p config drafts queue/pending queue/approved queue/rejected queue/failed data

# Puppeteer stores its Chromium binary here inside the container
ENV PUPPETEER_CACHE_DIR=/root/.cache/puppeteer

EXPOSE 3000
