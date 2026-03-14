@echo off
echo Starting MindScreen AI (Local Mode)...
echo.
cd backend
if not exist "venv" (
    echo Creating Python Virtual Environment...
    python -m venv venv
)
call venv\Scripts\activate
pip install -r requirements.txt
echo launching...
start "" "http://localhost:8000"
python main.py
pause
