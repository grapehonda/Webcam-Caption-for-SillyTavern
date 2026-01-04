# Auto Webcam Caption Extension for SillyTavern

Appends real-time AI-generated captions from your webcam to user messages in SillyTavern, enhancing immersion by describing what the AI "sees" in the room (e.g., your expression, gestures, background). Supports face recognition, add anyone you want with a few photos using the `upload & generate` button.
## Features
- Automatic captioning every N messages (configurable, default every 3, always captions first message).
- Face recognition using InsightFace (checks against your reference photos).
- Multiple faces can be added for detection so characters recognize them by their given name (even Doobie the dog!)
- Custom hint templates (random variation) and caption prompts.
- Manual "Look" trigger button (even if auto is off).
- Toggle button
  
  ![alt_text](https://github.com/grapehonda/Webcam-Caption-for-SillyTavern/blob/main/webcam_caption_server/Screenshots/Buttons.png)
  
- UI for uploading photos and regenerating embeddings (no command line needed).
  
  ![alt text](https://github.com/grapehonda/Webcam-Caption-for-SillyTavern/blob/main/webcam_caption_server/Screenshots/NewUI.png)
  
- Webcam preview in settings for easy testing.
- Uses KoboldCPP with a vision model for captioning.

## Requirements
- SillyTavern installed.
- Python 3.8+ with venv.
- KoboldCPP running two instances: vision model on port 5002 (with --mmproj), text model on port 5001.
- Webcam access.
- Dependencies: `flask`, `flask-cors`, `opencv-python`, `requests`, `torch`, `insightface`, `onnxruntime-gpu`, `numpy`.

## Installation
1. Download and extract the `auto_webcam_caption` folder into your SillyTavern extensions directory (usually `SillyTavern/data/default-user/extensions/`).
2. In the `auto_webcam_caption` folder, run `start_server.sh` on Linux, or `(windows)start_server.bat` for Windows.
   
   ![alt_text](https://github.com/grapehonda/Webcam-Caption-for-SillyTavern/blob/main/webcam_caption_server/Screenshots/FileTree.png)

## Setup Face Recognition (Optional but Recommended)
1. In SillyTavern extension settings, enable "Face Recognition".
2. Type a name for the person you're uploading (use `{{user}}` for yourself), select 5-10 clear photos of your face.
3. Click `upload & generate` to process them.
4. Use the "Preview Webcam" button to test your camera setup.

## Usage
- Toggle auto-captioning with the camera icon button.
- Click the "Look" button for a manual caption (works even if auto is off; sends your custom trigger message).
- Customize settings: face recognition toggle, frequency slider, hint templates (use `{{caption}}` placeholder), custom caption prompt.
- Quick test: `curl -X POST http://127.0.0.1:5000/v1/chat/completions -H "Content-Type: application/json" -d '{"enable_face_check": true}'`.

## Notes & Troubleshooting
- Captions are short, immersive bullet points from the AI's perspective (e.g., "You're smiling warmly into my eyes").
- If captions feel off, tweak the custom prompt or hint templates in the extension settings.
- Face recognition: >0.55 similarity = you (uses "you/your"); else treats as stranger.
- Common issues: Ensure webcam permissions, KoboldCPP ports are free, and venv is active when running the server.
- No internet required—everything runs locally.
- Author: Gil | Version: 1.0
