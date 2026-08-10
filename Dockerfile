FROM node:22-bookworm-slim

# Required utilities
RUN apt-get update && \
    apt-get install -y \
        python3 \
        curl \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp
RUN curl -L \
    https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    -o /usr/local/bin/yt-dlp && \
    chmod +x /usr/local/bin/yt-dlp

WORKDIR /app

# Install dependencies first for Docker layer caching
COPY package*.json ./

RUN npm ci --omit=dev

# Copy application
COPY . .

ENV NODE_ENV=production

EXPOSE 3000

CMD ["npm", "start"]