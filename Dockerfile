# Use a full, non-slim version of Node.js as a base for better compatibility.
FROM node:18.17.0

# Install the necessary system dependencies for Puppeteer.
# The 'gconf-service' is a legacy dependency, but it's often required.
RUN apt-get update && apt-get install -y \
    gconf-service \
    libgbm-dev \
    libasound2 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgcc1 \
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
    libappindicator1 \
    libnss3 \
    libgconf-2-4 \
    libasound2 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libxkbcommon-x11-0 \
    libxshmfence-dev \
    libxcomposite-dev \
    libxcursor-dev \
    libxdamage-dev \
    libxfixes-dev \
    libxi-dev \
    libxrandr-dev \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Set the working directory inside the container.
WORKDIR /usr/src/app

# Copy the core application files and dependencies.
COPY package*.json ./

# Install application dependencies.
RUN npm install

# This is the corrected line. It copies everything from your local
# root directory into the container's app directory.
COPY . .

# Expose the port your application listens on.
EXPOSE 8080

# Define the command to start your application.
CMD ["node", "server.js"]