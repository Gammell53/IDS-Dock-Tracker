#!/bin/bash

# Configuration
REPO_DIR="/var/www/ids-dock-tracker"
GITHUB_REPO="https://github.com/Gammell53/IDS-Dock-Tracker.git"
BRANCH="main"
VENV_DIR="$REPO_DIR/venv"

# Navigate to the project directory
cd $REPO_DIR

# Remove __pycache__ directories and .pyc files
echo "Removing __pycache__ directories and .pyc files..."
find . -type d -name "__pycache__" -exec rm -rf {} +
find . -type f -name "*.pyc" -delete

# Stash local changes
git stash

# Fetch the latest code from GitHub
git fetch origin $BRANCH

# Reset to the latest commit on the remote branch
git reset --hard origin/$BRANCH

# Apply stashed changes (if any)
git stash pop

# Frontend deployment
echo "Deploying frontend..."
npm install
npm run build

# Backend deployment
echo "Deploying backend..."
if [ ! -d "$VENV_DIR" ]; then
    echo "Creating virtual environment..."
    python3 -m venv $VENV_DIR
fi

# Activate virtual environment
source $VENV_DIR/bin/activate

# Install or update Python dependencies
pip install -r requirements.txt

# Deactivate virtual environment
deactivate

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