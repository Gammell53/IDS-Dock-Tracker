#!/bin/bash

# DigitalOcean Configuration
SERVER_IP="209.38.75.55"
DEPLOY_PATH="/root/ids-dock-tracker"

# Copy files to server
echo "Copying files to server..."
ssh root@$SERVER_IP "mkdir -p $DEPLOY_PATH"
scp -r * .env.prod root@$SERVER_IP:$DEPLOY_PATH

# Install Docker and Docker Compose on the server
echo "Setting up Docker on server..."
ssh root@$SERVER_IP "bash -s" << 'ENDSSH'
    # Update system
    apt-get update
    apt-get upgrade -y

    # Install Docker if not installed
    if ! command -v docker &> /dev/null; then
        curl -fsSL https://get.docker.com -o get-docker.sh
        sh get-docker.sh
    fi

    # Install Docker Compose if not installed
    if ! command -v docker compose &> /dev/null; then
        apt-get install -y docker-compose-plugin
    fi

    # Navigate to project directory and deploy
    cd $DEPLOY_PATH
    docker compose -f docker-compose.prod.yml --env-file .env.prod down
    docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
ENDSSH

echo "Deployment completed!"
