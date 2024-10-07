from fastapi import FastAPI, WebSocket, HTTPException, Depends, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import create_engine, Column, Integer, String
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from pydantic import BaseModel
from typing import List
import asyncio
import logging
import json
from jose import JWTError, jwt
from passlib.context import CryptContext
from datetime import datetime, timedelta
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Secret key to sign JWT tokens
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    SECRET_KEY = "your_secret_key_here"  # Fallback for development
    logger.warning("Using default SECRET_KEY. This is not secure for production.")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

# Database setup
SQLALCHEMY_DATABASE_URL = "sqlite:///./docks.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Dock model
class Dock(Base):
    __tablename__ = "docks"
    id = Column(Integer, primary_key=True, index=True)
    location = Column(String, index=True)
    number = Column(Integer)
    status = Column(String)

Base.metadata.create_all(bind=engine)

# Pydantic models
class DockBase(BaseModel):
    location: str
    number: int
    status: str

class DockCreate(DockBase):
    pass

class DockUpdate(BaseModel):
    status: str

class DockInDB(DockBase):
    id: int

    class Config:
        from_attributes = True

# User model
class User(BaseModel):
    username: str

# Token model
class Token(BaseModel):
    access_token: str
    token_type: str

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# OAuth2 scheme
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# FastAPI app
app = FastAPI()

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# User functions
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def authenticate_user(username: str, password: str):
    if username == "deicer" and password == "deicer":
        return User(username=username)
    return None

def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
        token_data = User(username=username)
    except JWTError:
        raise credentials_exception
    return token_data

# WebSocket connections store
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            await connection.send_text(message)

    async def send_full_sync(self, websocket: WebSocket):
        docks = db.query(Dock).all()
        await websocket.send_json({
            "type": "full_sync",
            "docks": [dock.__dict__ for dock in docks]
        })

manager = ConnectionManager()

# Routes
@app.post("/token", response_model=Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends()):
    user = authenticate_user(form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/api/docks", response_model=List[DockInDB])
def get_docks(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        logger.info("Fetching docks from database")
        docks = db.query(Dock).all()
        logger.info(f"Found {len(docks)} docks")
        return docks
    except Exception as e:
        logger.error(f"Error fetching docks: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.put("/api/docks/{dock_id}", response_model=DockInDB)
async def update_dock(dock_id: int, dock_update: DockUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    db_dock = db.query(Dock).filter(Dock.id == dock_id).first()
    if db_dock is None:
        raise HTTPException(status_code=404, detail="Dock not found")
    
    db_dock.status = dock_update.status
    db.commit()
    db.refresh(db_dock)

    # Broadcast update to all connected WebSocket clients
    await manager.broadcast(json.dumps({
        "type": "dock_updated",
        "data": {
            "id": db_dock.id,
            "location": db_dock.location,
            "number": db_dock.number,
            "status": db_dock.status
        }
    }))

    return db_dock

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            if message["type"] == "ping":
                await websocket.send_json({"type": "pong"})
            elif message["type"] == "request_full_sync":
                await manager.send_full_sync(websocket)
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# Initialize database
def init_db():
    db = SessionLocal()
    try:
        # Check if docks already exist
        existing_docks = db.query(Dock).all()
        if not existing_docks:
            logger.info("No existing docks found. Initializing docks...")
            # Initialize docks
            southeast_docks = [Dock(location='southeast', number=i, status='available') for i in range(1, 14)]
            southwest_dock_names = ['H84', 'H86', 'H87', 'H89', 'H90', 'H92', 'H93', 'H95', 'H96', 'H98', 'H99']
            southwest_docks = [Dock(location='southwest', number=i, status='available') for i, name in enumerate(southwest_dock_names, start=1)]
            
            db.add_all(southeast_docks + southwest_docks)
            db.commit()
            logger.info(f"Initialized {len(southeast_docks) + len(southwest_docks)} docks.")
        else:
            logger.info(f"Found {len(existing_docks)} existing docks in the database.")
    except Exception as e:
        logger.error(f"Error initializing database: {str(e)}")
    finally:
        db.close()

@app.on_event("startup")
async def startup_event():
    init_db()
    logger.info("Application startup: Database initialized")

# Add this new route for debugging
@app.get("/api/debug")
def debug_info():
    return {"status": "OK", "message": "API is running"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)