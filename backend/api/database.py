"""
Database connection module - MongoDB via Motor (async)
"""

import os
from motor.motor_asyncio import AsyncIOMotorClient
from typing import Optional
import logging

logger = logging.getLogger(__name__)

MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DATABASE_NAME = os.getenv("DATABASE_NAME", "mindscreen")

client: Optional[AsyncIOMotorClient] = None
db = None


async def connect_db():
    global client, db
    try:
        client = AsyncIOMotorClient(MONGO_URL)
        db = client[DATABASE_NAME]
        await client.admin.command('ping')
        logger.info(f"Connected to MongoDB: {DATABASE_NAME}")
    except Exception as e:
        logger.error(f"MongoDB connection error: {e}")
        # Use in-memory fallback for development
        logger.info("Using in-memory storage fallback")


async def disconnect_db():
    global client
    if client:
        client.close()
        logger.info("MongoDB connection closed")


def get_db():
    return db
