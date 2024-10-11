# Build stage
FROM oven/bun:1

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN bun install

COPY . .
RUN bun run build

# Production stage
FROM oven/bun:1

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    libstdc++ \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/dist ./dist
COPY package*.json ./

RUN bun install --production

EXPOSE 3001

CMD ["bun", "dist/index.js"]