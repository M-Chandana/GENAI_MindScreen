@echo off
echo Starting MindScreen AI Deployment...
echo.
echo 1. Checking for Docker...
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Docker is not installed and is required for the one-click link experience.
    echo Please install Docker Desktop from https://www.docker.com/products/docker-desktop
    pause
    exit /b
)

echo 2. Building Standalone Application Image...
docker build -t mindscreen-app .

echo 3. Launching MindScreen...
echo.
echo [LINK] The app will be available at: http://localhost:8000
echo.
start "" "http://localhost:8000"
docker run -p 8000:8000 --env-file ./backend/.env mindscreen-app
