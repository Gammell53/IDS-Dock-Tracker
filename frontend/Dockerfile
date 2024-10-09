# Build stage
FROM node:18-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm i

COPY . .
RUN npm run build

# Production stage
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm i --only=production

COPY .next ./.next
# COPY public ./public
COPY next.config.* ./

EXPOSE 3000

CMD ["npm", "start"]