"""Auth Routes - Simple JWT authentication"""
from fastapi import APIRouter, HTTPException
from models.schemas import UserLogin, Token
import hashlib, secrets, time
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

# Demo users (in production, use MongoDB + bcrypt)
_users = {
    "patient": {"password": hashlib.sha256(b"patient123").hexdigest(), "role": "patient"},
    "doctor": {"password": hashlib.sha256(b"doctor123").hexdigest(), "role": "clinician"},
    "admin": {"password": hashlib.sha256(b"admin123").hexdigest(), "role": "clinician"},
}

logger.warning(f"DEBUG: Stored 'patient' hash: {_users['patient']['password']}")

_tokens = {}

@router.post("/login", response_model=Token)
async def login(credentials: UserLogin):
    username = credentials.username.lower().strip()
    logger.warning(f"DEBUG: Login attempt for username: '{username}'")
    user = _users.get(username)
    pw_hash = hashlib.sha256(credentials.password.encode()).hexdigest()
    
    logger.warning(f"DEBUG: Computed hash for '{credentials.password}': {pw_hash}")

    if not user:
        logger.warning(f"DEBUG: User '{username}' not found. Available: {list(_users.keys())}")
        raise HTTPException(status_code=401, detail=f"User '{username}' not found")
        
    if user["password"] != pw_hash:
        logger.warning(f"DEBUG: Password mismatch for user '{username}'")
        logger.warning(f"DEBUG: Stored: {user['password']}")
        logger.warning(f"DEBUG: Input:  {pw_hash}")
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    logger.info(f"DEBUG: Login successful: {username}")
    
    token = secrets.token_urlsafe(32)
    _tokens[token] = {"username": credentials.username, "role": user["role"], "exp": time.time() + 86400}
    
    return Token(access_token=token, token_type="bearer", role=user["role"], username=credentials.username)

@router.post("/register")
async def register(credentials: UserLogin):
    username = credentials.username.lower().strip()
    if username in _users:
        raise HTTPException(status_code=400, detail="Username already exists")
    _users[username] = {
        "password": hashlib.sha256(credentials.password.encode()).hexdigest(),
        "role": "patient"
    }
    logger.info(f"User registered: {username}")
    return {"message": "Registered successfully"}

@router.get("/verify/{token}")
async def verify_token(token: str):
    data = _tokens.get(token)
    if not data or data["exp"] < time.time():
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return data
