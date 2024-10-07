#!/bin/bash

# Activate the virtual environment
source /var/www/ids-dock-tracker/venv/bin/activate

# Run the FastAPI application with WebSocket support
uvicorn main:app --host 0.0.0.0 --port 8000 --ws websockets