#!/bin/bash

# Configuration
REPO_DIR="/var/www/IDS-Dock-Tracker"
GITHUB_REPO="https://github.com/Gammell53/IDS-Dock-Tracker.git"
BRANCH="nodejs"
SERVER_IP="209.38.75.55"
SERVER_USER="root"
UPLOAD_PATH="/home/ids-deploy"

# Build frontend
echo "Building frontend..."
cd frontend
npm i
npm run build
cd ..

# Build backend
echo "Building backend..."
cd backend
npm i
bun run build --target=bun
cd ..

# Build Docker images
echo "Building Docker images..."
docker-compose build

# Save images to tar files
echo "Saving Docker images..."
docker save ids-dock-tracker_frontend > frontend_image.tar
docker save ids-dock-tracker_backend > backend_image.tar

# Transfer images to server
echo "Transferring Docker images to server..."
scp frontend_image.tar backend_image.tar $SERVER_USER@$SERVER_IP:$UPLOAD_PATH

# SSH into server and load images
echo "Loading Docker images on server..."
ssh $SERVER_USER@$SERVER_IP << EOF
    cd $UPLOAD_PATH
    docker load < frontend_image.tar
    docker load < backend_image.tar
    rm frontend_image.tar backend_image.tar

    # Stop and remove existing containers
    docker-compose down

    # Start new containers
    docker-compose up -d

    # Clean up old images
    docker image prune -f
EOF

# Clean up local tar files
echo "Cleaning up local files..."
rm frontend_image.tar backend_image.tar

echo "Deployment complete!"