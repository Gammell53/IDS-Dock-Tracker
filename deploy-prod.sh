#!/bin/bash

# Configuration
DEPLOY_PATH="/root/ids-deploy"
REPO_URL="https://github.com/Gammell53/IDS-Dock-Tracker.git"
BRANCH="main"

# Create deployment directory if it doesn't exist
mkdir -p $DEPLOY_PATH
cd $DEPLOY_PATH

# Pull latest code
if [ -d ".git" ]; then
    git pull origin $BRANCH
else
    git clone $REPO_URL .
    git checkout $BRANCH
fi

# Create .env.prod if it doesn't exist
if [ ! -f ".env.prod" ]; then
    cat > .env.prod << EOF
DB_USER=postgres
DB_PASSWORD=your_secure_password
DB_NAME=docktracker
JWT_SECRET=your_secure_jwt_secret
EOF
fi

# Stop running containers
docker-compose -f docker-compose.prod.yml down

# Build and start containers
docker-compose -f docker-compose.prod.yml up -d --build

# Wait for services to start
echo "Waiting for services to start..."
sleep 10

# Check service status
docker-compose -f docker-compose.prod.yml ps

echo "Deployment completed!"
