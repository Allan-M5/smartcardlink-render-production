# ------------------------------------------------------
# SmartCardLink Dockerfile - FINAL STABLE PRODUCTION BUILD
# ------------------------------------------------------

# Stage 1: Build Environment
FROM node:20-slim AS build

WORKDIR /app

# Copy package files first for dependency caching
COPY package*.json ./

# ✅ Install all dependencies (both dev + prod)
# This ensures pino-pretty is available during build if needed.
RUN npm install

# Copy all project files
COPY . .

# ------------------------------------------------------
# Stage 2: Production Image
# ------------------------------------------------------
FROM node:20-slim

# ✅ Install Chromium for Puppeteer
RUN apt-get update && apt-get install -y \
    chromium \
    chromium-driver \
    fonts-liberation \
    libatk-bridge2.0-0 \
    libnss3 \
    libxss1 \
    libasound2 \
    libatk1.0-0 \
    libdrm2 \
    libgbm1 \
    libxkbcommon0 \
    libxcomposite1 \
    libxrandr2 \
    libxdamage1 \
    libpango-1.0-0 \
    libcairo2 \
    libxext6 \
    libxfixes3 \
    libx11-xcb1 \
    wget && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ✅ Copy everything from build stage
COPY --from=build /app/ /app/

# ✅ Install only production dependencies in the final image
RUN npm prune --production

# ✅ Set environment variables
ENV NODE_ENV=production
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# ✅ Security: use non-root user
RUN useradd -m appuser
USER appuser

EXPOSE 8080

# ✅ Start the app
CMD ["node", "server.js"]
