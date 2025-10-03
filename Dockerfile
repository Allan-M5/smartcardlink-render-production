# Use full Node.js image (not slim) for maximum compatibility with Puppeteer
FROM node:18.17.0

# Install only required Chromium dependencies (lean & stable)
RUN apt-get update && apt-get install -y \
    libasound2 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm-dev \
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
    libxkbcommon-x11-0 \
    libxshmfence-dev \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Set workdir
WORKDIR /usr/src/app

# Copy dependency manifests first for caching
COPY package*.json ./

# Install dependencies
RUN npm install --legacy-peer-deps

# Copy app source code
COPY . .

# Expose port
EXPOSE 8080

# Start server
CMD ["node", "server.js"]
