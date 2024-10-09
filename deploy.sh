#!/bin/bash

# Configuration
GITHUB_REPO="https://github.com/Gammell53/IDS-Dock-Tracker.git"
BRANCH="deploy-test"
SERVER_IP="209.38.75.55"
SERVER_USER="root"
UPLOAD_PATH="/home/ids-deploy"

# Pull from GitHub repository
echo "Pulling from GitHub repository..."
ssh $SERVER_USER@$SERVER_IP << EOF
    cd $UPLOAD_PATH
    git pull origin $BRANCH
    if [ $? -ne 0 ]; then
        git clone -b $BRANCH $GITHUB_REPO .
    fi
EOF

# SSH into server and perform deployment steps
# echo "Performing deployment steps on server..."
# ssh $SERVER_USER@$SERVER_IP << EOF
cd $UPLOAD_PATH

# Build Docker images and run docker-compose
echo "Building and running Docker containers..."
docker-compose build
docker-compose up -d

# Clean up old images
docker image prune -f
# EOF

echo "Deployment complete!"

# Build frontend
# echo "Building frontend..."
# cd frontend
# npm i
# npm run build
# cd ..

# # Build backend
# echo "Building backend..."
# cd backend
# npm i
# bun run build --target=bun
# cd ..

# Re-creates the nginx container to pick up new config
# docker-compose up  --no-deps --force-recreate nginx
