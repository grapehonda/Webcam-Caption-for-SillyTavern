#!/bin/bash

# Auto Webcam Caption - Server Launcher

# Colors for pretty output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Auto Webcam Caption Server Launcher ===${NC}"

# Find the directory where the script is located (works even if called via symlink)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$SCRIPT_DIR" || {
    echo -e "${RED}Error: Could not change to script directory.$NC"
    exit 1
}

# Check if venv exists
if [ ! -d "venv" ]; then
    echo -e "${YELLOW}Virtual environment not found. Creating one...${NC}"
    python3 -m venv venv || python -m venv venv || {
        echo -e "${RED}Error: Failed to create virtual environment. Make sure Python is installed.$NC"
        exit 1
    }
    echo -e "${GREEN}Virtual environment created.${NC}"
fi

# Activate the virtual environment
echo -e "${YELLOW}Activating virtual environment...${NC}"
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
    # Windows (Git Bash)
    source venv/Scripts/activate || {
        echo -e "${RED}Error: Failed to activate venv on Windows.$NC"
        exit 1
    }
else
    # Linux / macOS
    source venv/bin/activate || {
        echo -e "${RED}Error: Failed to activate venv.$NC"
        exit 1
    }
fi

echo -e "${GREEN}Virtual environment activated.${NC}"

# Check if requirements are installed
if [ ! -f ".requirements_installed" ]; then
    echo -e "${YELLOW}Installing dependencies from requirements.txt...${NC}"
    pip install -r requirements.txt || {
        echo -e "${RED}Error: Failed to install requirements.$NC"
        deactivate
        exit 1
    }
    touch .requirements_installed  # Mark as installed to skip next time
    echo -e "${GREEN}Dependencies installed.${NC}"
else
    echo -e "${GREEN}Dependencies already installed (skipping pip install).${NC}"
fi

# Launch the server
echo -e "${GREEN}Starting webcam_caption_server.py...${NC}"
echo -e "${YELLOW}Press Ctrl+C to stop the server.${NC}"
echo "================================================"

python webcam_caption_server.py

# Deactivate on exit (optional - happens automatically on Ctrl+C)
deactivate
echo -e "${GREEN}Server stopped. Goodbye!${NC}"
