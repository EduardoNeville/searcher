FROM node:20

# Install system dependencies for document processing and better-sqlite3
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    libpixman-1-dev \
    libsqlite3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

# Install dependencies and rebuild native modules for Alpine
RUN npm install && \
    npm rebuild better-sqlite3

COPY . .

EXPOSE 3001

CMD ["npm", "start"]
