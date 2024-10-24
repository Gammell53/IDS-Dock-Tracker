#!/bin/bash

# Create required directories
mkdir -p nginx/certbot/conf
mkdir -p nginx/certbot/www

# Stop any running containers
docker-compose -f docker-compose.prod.yml down

# Start nginx with HTTP only first
cat > nginx/nginx.conf.http <<EOF
events {
    worker_connections 1024;
}

http {
    server {
        listen 80;
        server_name idsdock.com www.idsdock.com;
        
        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }
    }
}
EOF

cp nginx/nginx.conf.http nginx/nginx.conf
docker-compose -f docker-compose.prod.yml up -d nginx

# Wait for nginx to start
sleep 5

# Get the initial SSL certificate
docker-compose -f docker-compose.prod.yml run --rm certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email your-email@example.com \
    --agree-tos \
    --no-eff-email \
    --force-renewal \
    -d idsdock.com

# Restore the full nginx configuration
cp nginx/nginx.conf.bak nginx/nginx.conf

# Restart everything with the full configuration
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d

echo "SSL certificate installation completed!"
