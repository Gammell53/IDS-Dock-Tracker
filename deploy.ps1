# DigitalOcean Configuration
$SERVER_IP = "209.38.75.55"
$DEPLOY_PATH = "/root/ids-dock-tracker"

# Create directory on server
Write-Host "Creating directory on server..."
ssh root@$SERVER_IP "mkdir -p $DEPLOY_PATH"

# Copy files to server
Write-Host "Copying files to server..."
scp -r * .env.prod root@$SERVER_IP`:$DEPLOY_PATH

# Setup and deploy on server
Write-Host "Setting up Docker and deploying on server..."
ssh root@$SERVER_IP @"
    # Update system
    apt-get update
    apt-get upgrade -y

    # Install Docker if not installed
    if (!(command -v docker)) {
        curl -fsSL https://get.docker.com -o get-docker.sh
        sh get-docker.sh
    }

    # Install Docker Compose if not installed
    if (!(command -v docker-compose)) {
        apt-get install -y docker-compose-plugin
    }

    # Navigate to project directory and deploy
    cd $DEPLOY_PATH
    docker compose -f docker-compose.prod.yml --env-file .env.prod down
    docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
"@

Write-Host "Deployment completed!"
