# Build stage
FROM oven/bun:1 AS build

WORKDIR /app

# Check Bun version
RUN bun --version

COPY package*.json ./
RUN bun install --verbose

COPY . .
RUN ls -la
RUN bun run build --target=bun

ENV JWT_SECRET=gbstu1nj9qpFE74nXW-YibXzM33Je5lDxjWCdqs3HKI

EXPOSE 3001

CMD ["bun", "run", "src/index.ts"]