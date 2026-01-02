@echo off
title Auto Webcam Caption Server

echo === Auto Webcam Caption Server Launcher ===

set SCRIPT_DIR=%~dp0
cd /d %SCRIPT_DIR%

if not exist venv (
    echo Virtual environment not found. Creating one...
    python -m venv venv
    if errorlevel 1 (
        echo Error: Failed to create virtual environment. Make sure Python is installed.
        pause
        exit /b 1
    )
    echo Virtual environment created.
)

echo Activating virtual environment...
call venv\Scripts\activate.bat
if errorlevel 1 (
    echo Error: Failed to activate venv.
    pause
    exit /b 1
)

echo Virtual environment activated.

if not exist .requirements_installed (
    echo Installing dependencies from requirements.txt...
    pip install -r requirements.txt
    if errorlevel 1 (
        echo Error: Failed to install requirements.
        deactivate
        pause
        exit /b 1
    )
    type nul > .requirements_installed
    echo Dependencies installed.
) else (
    echo Dependencies already installed (skipping pip install).
)

echo Starting webcam_caption_server.py...
echo Press Ctrl+C to stop the server.
echo ================================================

python webcam_caption_server.py

deactivate
echo Server stopped. Goodbye!
pause
