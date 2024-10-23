#!/bin/bash

# Create required directories
mkdir -p nginx/certbot/conf
mkdir -p nginx/certbot/www

# Stop any running containers
docker-compose -f docker-compose.prod.yml down

# Start nginx
docker-compose -f docker-compose.prod.yml up -d nginx

# Get SSL certificate
docker-compose -f docker-compose.prod.yml run --rm certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email your-email@example.com \
    --agree-tos \
    --no-eff-email \
    -d idsdock.com \
    -d www.idsdock.com

# Restart nginx to load the certificates
docker-compose -f docker-compose.prod.yml restart nginx
