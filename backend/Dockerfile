# Build stage
FROM oven/bun:1 AS build

WORKDIR /app

# Check Bun version
RUN bun --version

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

EXPOSE 3001

CMD ["bun", "run", "src/index.ts"]