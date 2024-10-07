#!/bin/bash

# Configuration
REMOTE_USER="your_username"
REMOTE_HOST="your_server_ip_or_domain"
REMOTE_DIR="/var/www/ids-dock-tracker"
GITHUB_REPO="https://github.com/your-username/your-repo-name.git"
BRANCH="main"  # or whichever branch you want to deploy

# SSH into the server and perform deployment
ssh $REMOTE_USER@$REMOTE_HOST << EOF
    # Navigate to the project directory
    cd $REMOTE_DIR

    # Pull the latest code from GitHub
    if [ -d ".git" ]; then
        git pull origin $BRANCH
    else
        git clone $GITHUB_REPO .
        git checkout $BRANCH
    fi

    # Install or update dependencies
    npm install

    # Build the Next.js app
    npm run build

    # Install or update Python dependencies
    pip install -r requirements.txt

    # Restart the FastAPI service
    sudo systemctl restart ids-dock-tracker

    # Restart Nginx
    sudo systemctl restart nginx

    echo "Deployment completed!"
EOF