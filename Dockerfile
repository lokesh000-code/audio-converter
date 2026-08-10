FROM node:20-bookworm

# Install Python + FFmpeg
RUN apt-get update && \
    apt-get install -y python3 python3-pip ffmpeg && \
    rm -rf /var/lib/apt/lists/*

# Some npm packages expect "python" instead of "python3"
RUN ln -s /usr/bin/python3 /usr/local/bin/python

# Install yt-dlp
RUN pip3 install --break-system-packages yt-dlp

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

RUN mkdir -p converted uploads

EXPOSE 3000

CMD ["node", "server.js"]