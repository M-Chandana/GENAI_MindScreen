"""
MindScreen - Mental Health Pre-Assessment System
FastAPI Backend - Main Application
"""

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException, Depends, Request
import time
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager
import uvicorn
import logging

from api.routes import assessment, dashboard, auth, reports
from api.database import connect_db, disconnect_db

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    logger.info("Starting MindScreen API...")
    await connect_db()
    yield
    logger.info("Shutting down MindScreen API...")
    await disconnect_db()


app = FastAPI(
    title="MindScreen API",
    description="AI-Powered Mental Health Pre-Assessment System",
    version="1.0.0",
    lifespan=lifespan
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Temporarily open it up more for debugging
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time = (time.time() - start_time) * 1000
    logger.warning(f"DEBUG: {request.method} {request.url.path} - {response.status_code} ({process_time:.2f}ms)")
    return response

from fastapi.staticfiles import StaticFiles
import os

# Include routers
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(assessment.router, prefix="/api/assessment", tags=["Assessment"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["Dashboard"])
app.include_router(reports.router, prefix="/api/reports", tags=["Reports"])

# ── Serve Standalone Frontend ───────────────────────────────────────────
frontend_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", "dist")

if os.path.exists(frontend_path):
    app.mount("/static", StaticFiles(directory=frontend_path), name="static")
    
    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        # Serve index.html for all non-api routes (SPA behavior)
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404)
        
        file_path = os.path.join(frontend_path, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(frontend_path, "index.html"))
else:
    @app.get("/")
    async def root():
        return {"message": "MindScreen API v1.0.0", "status": "operational", "note": "Frontend not built"}

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "MindScreen API"}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
