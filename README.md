# Airport Dock Tracker

Created by Alex Gammell

## Overview

Airport Dock Tracker is a real-time application designed to manage and monitor airport docks at Dallas/Fort Worth International Airport (DFW). This system provides an intuitive interface for tracking the status of docks in both the southeast and southwest locations of the airport.

## Features

- Real-time dock status updates
- Separate tracking for southeast and southwest dock locations
- User authentication system
- Dark mode interface for improved visibility in various lighting conditions
- Responsive design for use on various devices

## How It Works

1. Users log in to the system using their credentials.
2. The main interface displays a grid of docks, color-coded by their current status:
   - Available (Green)
   - Occupied (Yellow)
   - Out of Service (Red)
   - Deiced (Blue)
3. Users can filter docks by status and switch between southeast and southwest locations.
4. Dock statuses can be updated in real-time, with changes immediately reflected for all users.
5. The system uses WebSockets to ensure all clients receive updates without needing to refresh the page.

## Technologies Used

### Frontend
- Next.js: React framework for building the user interface
- TypeScript: For type-safe JavaScript code
- Tailwind CSS: For styling and responsive design
- Lucide React: For icons
- Socket.io-client: For real-time WebSocket connections

### Backend
- Flask: Python web framework for the API
- SQLAlchemy: ORM for database interactions
- Flask-SocketIO: For WebSocket support in Flask
- SQLite: As the database for storing dock information

### Development and Deployment
- Git & GitHub: For version control and code hosting
- DigitalOcean: For hosting the application
