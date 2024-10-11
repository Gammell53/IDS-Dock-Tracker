# Build stage
FROM oven/bun:1 as build

WORKDIR /app

COPY package*.json ./
RUN bun install

COPY . .
RUN bun run build

# Production stage
FROM oven/bun:1

WORKDIR /app

COPY --from=build /app/dist ./dist
COPY package*.json ./

RUN bun install --production

EXPOSE 3001

CMD ["bun", "dist/index.js"]