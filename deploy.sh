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

# Check for uncommitted changes
if [[ $(git status --porcelain) ]]; then
    echo "There are uncommitted changes. Please commit or stash them before deploying."
    exit 1
fi

# Fetch the latest code from GitHub
git fetch origin $BRANCH

# Check if we're behind the remote
if [[ $(git rev-list HEAD..origin/$BRANCH --count) -ne 0 ]]; then
    echo "Local branch is behind remote. Attempting to merge..."
    if git merge origin/$BRANCH; then
        echo "Merge successful."
    else
        echo "Merge failed. Please resolve conflicts manually and try again."
        exit 1
    fi
else
    echo "Local branch is up to date."
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

# Use the virtual environment's pip directly
$VENV_DIR/bin/pip install -r requirements.txt

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