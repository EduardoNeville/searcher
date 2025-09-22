FROM node:22-alpine

# Install system dependencies for document processing
RUN apk add --no-cache \
    python3 \
    py3-pip \
    build-base \
    cairo-dev \
    pango-dev \
    libjpeg-turbo-dev \
    giflib-dev \
    librsvg-dev \
    pixman-dev

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3001

CMD ["npm", "start"]
