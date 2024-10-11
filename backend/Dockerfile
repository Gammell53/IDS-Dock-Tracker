# Build stage
FROM oven/bun:1 as build

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN bun install

COPY . .
RUN bun run build

# Production stage
FROM oven/bun:1

WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache libstdc++

COPY --from=build /app/dist ./dist
COPY package*.json ./

RUN bun install --production

EXPOSE 3001

CMD ["bun", "dist/index.js"]