#!/bin/bash

# Configuration
REPO_DIR="/var/www/ids-dock-tracker"
GITHUB_REPO="https://github.com/Gammell53/IDS-Dock-Tracker.git"
BRANCH="main"

# Navigate to the project directory
cd $REPO_DIR

# Stash local changes
git stash

# Pull the latest code from GitHub
git pull origin $BRANCH

# Apply stashed changes (if any)
git stash pop

# Remove any .pyc files and __pycache__ directories
find . -type f -name "*.pyc" -delete
find . -type d -name "__pycache__" -exec rm -r {} +

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
sudo systemctl restart ids-dock-tracker

# Restart the frontend service (assuming you're using PM2 for the frontend)
echo "Restarting frontend service..."
pm2 restart next-app

# Restart Nginx
echo "Restarting Nginx..."
sudo systemctl restart nginx

echo "Deployment completed!"