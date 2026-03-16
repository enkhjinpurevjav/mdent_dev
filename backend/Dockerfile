FROM node:20-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
  bash python3 build-essential openssl curl \
  && rm -rf /var/lib/apt/lists/*

# Install deps (include dev deps so prisma CLI exists)
COPY package*.json ./
RUN npm ci

# Copy app
COPY . .

# Generate Prisma Client at build time
RUN npx prisma generate

# Remove dev deps for smaller production image
RUN npm prune --omit=dev

EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node","src/index.js"]
