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

# Fetch the latest code from GitHub
git fetch origin $BRANCH

# Check for conflicts
if git merge-base --is-ancestor HEAD origin/$BRANCH; then
    echo "Fast-forward possible. Pulling changes..."
    git merge origin/$BRANCH
else
    echo "Fast-forward not possible. Stashing changes, pulling, and then applying stash..."
    git stash
    git merge origin/$BRANCH
    git stash pop
fi

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