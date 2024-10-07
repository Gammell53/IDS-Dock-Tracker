#!/bin/bash

# Configuration
REPO_DIR="/var/www/ids-dock-tracker"
GITHUB_REPO="https://github.com/your-username/your-repo-name.git"
BRANCH="main"

# Navigate to the project directory
cd $REPO_DIR

# Pull the latest code from GitHub
git pull origin $BRANCH

# Frontend deployment
echo "Deploying frontend..."
npm install
npm run build

# Backend deployment
echo "Deploying backend..."
source venv/bin/activate
pip install -r requirements.txt

# Restart the backend service
echo "Restarting backend service..."
sudo systemctl restart ids-dock-api

# Restart the frontend service (assuming you're using PM2 for the frontend)
echo "Restarting frontend service..."
pm2 restart ids-dock-tracker

# Restart Nginx
echo "Restarting Nginx..."
sudo systemctl restart nginx

echo "Deployment completed!"