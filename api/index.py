from aiohttp import web
from aiohttp_cors import setup as cors_setup, ResourceOptions
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy import Column, Integer, String
from sqlalchemy.future import select
from sqlalchemy.exc import SQLAlchemyError
import asyncio
import logging
import json
from datetime import datetime, timedelta
import pytz
import random

# Create Base for declarative models
Base = declarative_base()

# Define Dock model
class Dock(Base):
    __tablename__ = 'docks'
    id = Column(Integer, primary_key=True)
    location = Column(String(10), nullable=False)  # 'southeast' or 'southwest'
    number = Column(Integer, nullable=False)
    status = Column(String(20), nullable=False)

# Create async engine and session
engine = create_async_engine('sqlite+aiosqlite:///docks.db', echo=True)
async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

# Set up logging
logging.basicConfig(level=logging.DEBUG)

app = web.Application()
cors = cors_setup(app, defaults={
    "*": ResourceOptions(
        allow_credentials=True,
        expose_headers="*",
        allow_headers="*",
    )
})

# WebSocket connections store
ws_connections = set()

async def get_docks(request):
    logging.debug('GET /api/docks called')
    try:
        async with async_session() as session:
            result = await session.execute(select(Dock))
            docks = result.scalars().all()
            dock_list = [{'id': dock.id, 'location': dock.location, 'number': dock.number, 'status': dock.status} for dock in docks]
            logging.info(f'Fetched {len(dock_list)} docks')
            return web.json_response(dock_list)
    except SQLAlchemyError as e:
        logging.error(f'Error fetching docks: {str(e)}')
        return web.json_response({'error': str(e)}, status=500)

async def update_dock(request):
    dock_id = int(request.match_info['dock_id'])
    try:
        data = await request.json()
        logging.info(f'Updating dock {dock_id}')
        
        if 'status' not in data:
            return web.json_response({'error': 'Status is required'}, status=400)
        if data['status'] not in ['available', 'occupied', 'out-of-service', 'deiced']:
            return web.json_response({'error': 'Invalid status'}, status=400)
        
        async with async_session() as session:
            result = await session.execute(select(Dock).filter_by(id=dock_id))
            dock = result.scalar_one_or_none()
            
            if not dock:
                return web.json_response({'error': 'Dock not found'}, status=404)
            
            dock.status = data['status']
            await session.commit()
            
            logging.info(f'Updated dock {dock_id} to status {dock.status}')
            
            # Broadcast update to all connected WebSocket clients
            update_message = json.dumps({
                'type': 'dock_updated',
                'data': {'id': dock.id, 'location': dock.location, 'number': dock.number, 'status': dock.status}
            })
            for ws in ws_connections:
                await ws.send_str(update_message)
            
            return web.json_response({'id': dock.id, 'location': dock.location, 'number': dock.number, 'status': dock.status})
    except SQLAlchemyError as e:
        logging.error(f'Error updating dock {dock_id}: {str(e)}')
        return web.json_response({'error': str(e)}, status=500)
    except Exception as e:
        logging.error(f'Unexpected error updating dock {dock_id}: {str(e)}')
        return web.json_response({'error': 'An unexpected error occurred'}, status=500)

async def websocket_handler(request):
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    
    ws_connections.add(ws)
    
    try:
        async for msg in ws:
            if msg.type == web.WSMsgType.TEXT:
                # Handle incoming WebSocket messages if needed
                pass
            elif msg.type == web.WSMsgType.ERROR:
                logging.error(f'WebSocket connection closed with exception {ws.exception()}')
    finally:
        ws_connections.remove(ws)
    
    return ws

# Initialize database
async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    async with async_session() as session:
        # Check if docks already exist
        result = await session.execute(select(Dock))
        if result.scalars().first() is None:
            # Initialize docks
            southeast_docks = [Dock(location='southeast', number=i, status='available') for i in range(1, 14)]
            southwest_dock_names = ['H84', 'H86', 'H87', 'H89', 'H90', 'H92', 'H93', 'H95', 'H96', 'H98', 'H99']
            southwest_docks = [Dock(location='southwest', number=i, status='available') for i, name in enumerate(southwest_dock_names, start=1)]
            
            session.add_all(southeast_docks + southwest_docks)
            await session.commit()
            logging.info("Docks initialized.")
        else:
            logging.info("Docks already exist in the database.")

app.add_routes([
    web.get('/api/docks', get_docks),
    web.put('/api/docks/{dock_id}', update_dock),
    web.get('/ws', websocket_handler),
    # ... (add other routes)
])

if __name__ == '__main__':
    asyncio.run(init_db())
    web.run_app(app, host='0.0.0.0', port=5000)