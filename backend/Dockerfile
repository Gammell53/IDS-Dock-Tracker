# Build stage
FROM oven/bun:1 AS build

WORKDIR /app

# Check Bun version
RUN bun --version

# Install build dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN bun install --verbose

COPY . .
RUN ls -la
RUN bun run build

# After RUN bun run build
RUN ls -la dist

# Production stage
FROM oven/bun:1

WORKDIR /app

COPY --from=build /app/dist ./dist
COPY --from=build /app/src ./src
COPY package*.json ./

# Install production dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/* \
    && bun install --production

EXPOSE 3001

CMD ["bun", "run", "src/index.ts"]