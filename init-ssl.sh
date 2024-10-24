#!/bin/bash

# Create required directories
mkdir -p nginx/ssl/live/idsdock.com

# Copy existing certificates
cp /etc/letsencrypt/live/idsdock.com/fullchain.pem nginx/ssl/live/idsdock.com/
cp /etc/letsencrypt/live/idsdock.com/privkey.pem nginx/ssl/live/idsdock.com/

# Set proper permissions
chmod 644 nginx/ssl/live/idsdock.com/fullchain.pem
chmod 600 nginx/ssl/live/idsdock.com/privkey.pem

# Start the services
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d

echo "SSL certificates copied and services started!"
