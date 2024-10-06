from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from flask_socketio import SocketIO, emit
import os
from sqlalchemy.exc import SQLAlchemyError
import logging
import requests
import time
from datetime import datetime, timedelta, timezone
import pytz
import random

logging.basicConfig(level=logging.DEBUG)

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///docks.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)
socketio = SocketIO(app, cors_allowed_origins=["http://localhost:3000", "http://frontend:3000"], async_mode='threading')

# Define Dock model
class Dock(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    location = db.Column(db.String(10), nullable=False)  # 'southeast' or 'southwest'
    number = db.Column(db.Integer, nullable=False)
    status = db.Column(db.String(20), nullable=False)

@app.route('/api/docks', methods=['GET'])
def get_docks():
    logging.debug('GET /api/docks called')
    try:
        logging.info('Fetching all docks')
        docks = Dock.query.all()
        result = [{'id': dock.id, 'location': dock.location, 'number': dock.number, 'status': dock.status} for dock in docks]
        logging.info(f'Fetched {len(result)} docks')
        return jsonify(result)
    except SQLAlchemyError as e:
        logging.error(f'Error fetching docks: {str(e)}')
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/docks/<int:dock_id>', methods=['PUT'])
def update_dock(dock_id):
    try:
        logging.info(f'Updating dock {dock_id}')
        dock = Dock.query.get_or_404(dock_id)
        data = request.json
        if 'status' not in data:
            return jsonify({'error': 'Status is required'}), 400
        if data['status'] not in ['available', 'occupied', 'out-of-service', 'deiced']:
            return jsonify({'error': 'Invalid status'}), 400
        dock.status = data['status']
        db.session.commit()
        logging.info(f'Updated dock {dock_id} to status {dock.status}')
        
        # Emit a WebSocket event to all clients
        socketio.emit('dock_updated', {'id': dock.id, 'location': dock.location, 'number': dock.number, 'status': dock.status})
        
        return jsonify({'id': dock.id, 'location': dock.location, 'number': dock.number, 'status': dock.status})
    except SQLAlchemyError as e:
        logging.error(f'Error updating dock {dock_id}: {str(e)}')
        db.session.rollback()
        return jsonify({'error': str(e)}), 500
    except Exception as e:
        logging.error(f'Unexpected error updating dock {dock_id}: {str(e)}')
        db.session.rollback()
        return jsonify({'error': 'An unexpected error occurred'}), 500

@app.route('/api/test', methods=['GET'])
def test_route():
    return jsonify({"message": "API is working"}), 200

@app.route('/api/flights', methods=['GET'])
def get_flights():
    logging.debug('GET /api/flights called')
    try:
        # Set up Dallas time zone
        dallas_tz = pytz.timezone('America/Chicago')
        dallas_now = datetime.now(dallas_tz)

        # Make a request to AviationStack API
        url = 'http://api.aviationstack.com/v1/flights'
        params = {
            'access_key': '81817636f3c6b7bf65aed6183fb1aa5f',
            'flight_status': 'scheduled',
            'arr_iata': 'DFW',  # IATA code for Dallas/Fort Worth International Airport
            'limit': 100  # Fetch up to 100 flights
        }
        
        logging.debug(f"Requesting AviationStack API with params: {params}")
        response = requests.get(url, params=params)
        logging.debug(f"AviationStack API response status: {response.status_code}")
        
        if response.status_code != 200:
            logging.error(f"AviationStack API error: {response.text}")
            raise Exception(f"AviationStack API error: {response.status_code}")
        
        data = response.json()
        
        if 'error' in data:
            logging.error(f"AviationStack API error: {data['error']['message']}")
            raise Exception(f"AviationStack API error: {data['error']['message']}")
        
        flights = data.get('data', [])
        logging.debug(f"Received {len(flights)} flights from API")
        
        formatted_flights = []
        
        for flight in flights:
            logging.debug(f"Processing flight: {flight}")
            try:
                arrival = flight.get('arrival', {})
                departure = flight.get('departure', {})
                aircraft = flight.get('aircraft', {})
                flight_info = flight.get('flight', {})
                
                arrival_time = arrival.get('estimated') or arrival.get('scheduled')
                if arrival_time:
                    # Convert arrival time to Dallas time
                    arrival_datetime = datetime.fromisoformat(arrival_time.replace('Z', '+00:00')).astimezone(dallas_tz)
                    logging.debug(f"Flight arrival time (Dallas): {arrival_datetime}")
                    
                    time_until_arrival = max(0, (arrival_datetime - dallas_now).total_seconds() / 60)  # in minutes
                    formatted_flight = {
                        'icao24': aircraft.get('icao24', 'N/A') if aircraft else 'N/A',
                        'callsign': flight_info.get('iata', 'N/A'),
                        'estDepartureAirport': departure.get('iata', 'N/A'),
                        'estimatedArrivalTime': arrival_datetime.isoformat(),
                        'minutesUntilArrival': int(time_until_arrival),
                        'arrivalAirport': 'DFW'
                    }
                    formatted_flights.append(formatted_flight)
                    logging.debug(f"Formatted flight: {formatted_flight}")
                else:
                    logging.warning(f"No arrival time found for flight: {flight}")
            except Exception as e:
                logging.error(f"Error formatting flight: {e}", exc_info=True)
                continue
        
        # Sort by estimated arrival time
        formatted_flights.sort(key=lambda x: x['estimatedArrivalTime'])
        
        logging.info(f'Fetched and sorted {len(formatted_flights)} flights')
        return jsonify(formatted_flights)
    except Exception as e:
        logging.error(f'Error fetching flights: {str(e)}', exc_info=True)
        return jsonify({'error': str(e)}), 500

@app.route('/api/mock-flights', methods=['GET'])
def get_mock_flights():
    logging.debug('GET /api/mock-flights called')
    try:
        # Set up Dallas time zone
        dallas_tz = pytz.timezone('America/Chicago')
        dallas_now = datetime.now(dallas_tz)

        # Generate mock flights
        mock_flights = []
        for i in range(20):  # Generate 20 mock flights
            arrival_time = dallas_now + timedelta(minutes=random.randint(30, 300))
            mock_flight = {
                'icao24': f'ABC{random.randint(100, 999)}',
                'callsign': f'FL{random.randint(1000, 9999)}',
                'estDepartureAirport': random.choice(['LAX', 'JFK', 'ORD', 'ATL', 'SFO']),
                'estimatedArrivalTime': arrival_time.isoformat(),
                'minutesUntilArrival': int((arrival_time - dallas_now).total_seconds() / 60),
                'arrivalAirport': 'DFW'
            }
            mock_flights.append(mock_flight)

        # Sort by estimated arrival time
        mock_flights.sort(key=lambda x: x['estimatedArrivalTime'])

        logging.info(f'Generated {len(mock_flights)} mock flights')
        return jsonify(mock_flights)
    except Exception as e:
        logging.error(f'Error generating mock flights: {str(e)}', exc_info=True)
        return jsonify({'error': str(e)}), 500

southwest_dock_names = ['H84', 'H86', 'H87', 'H89', 'H90', 'H92', 'H93', 'H95', 'H96', 'H98', 'H99']

with app.app_context():
    db.create_all()
    logging.info("Database tables created.")
    # Initialize docks if they don't exist
    if Dock.query.count() == 0:
        logging.info("Initializing docks...")
        for i in range(1, 14):  # 13 docks for southeast
            db.session.add(Dock(location='southeast', number=i, status='available'))
        for i, name in enumerate(southwest_dock_names, start=1):  # 11 docks for southwest
            db.session.add(Dock(location='southwest', number=i, status='available'))
        db.session.commit()
        logging.info("Docks initialized.")
    else:
        logging.info(f"Found {Dock.query.count()} existing docks.")

# Add this after the initialization block
with app.app_context():
    southeast_count = Dock.query.filter_by(location='southeast').count()
    southwest_count = Dock.query.filter_by(location='southwest').count()
    if southeast_count != 13 or southwest_count != 11:
        logging.warning(f"Unexpected dock count: Southeast: {southeast_count}, Southwest: {southwest_count}")
        # Optionally, you could reinitialize the docks here if the counts are incorrect

# Vercel requires a handler function
def handler(event, context):
    logging.debug(f'Handler called with event: {event}')
    return app.wsgi_app(event['httpMethod'], event['path'], event['headers'], event['body'])

if __name__ == '__main__':
    socketio.run(app, debug=True, port=5000)