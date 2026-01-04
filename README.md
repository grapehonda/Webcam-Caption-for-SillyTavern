
# Auto Webcam Caption Extension for SillyTavern

![Webcam Caption Extension](https://github.com/grapehonda/Webcam-Caption-for-SillyTavern/blob/main/webcam_caption_server/Screenshots/NewUI.png)

This SillyTavern extension captures real-time images from your webcam, generates AI-powered captions describing what the AI "sees" (like your expressions, gestures, or background), and appends them to user messages for enhanced immersion. It includes face recognition support, allowing you to add multiple people or pets with just a few photos via the user-friendly UI.

## Features

- **Automatic Captioning**: Triggers every N messages (configurable, default every 3; always captions the first message).
- **Idle Captioning**: Automatically triggers a caption and AI response after a configurable period of user inactivity (default: disabled, 300 seconds).
- **Face Recognition**: Powered by InsightFace; detects and recognizes faces against your uploaded reference photos. Supports multiple faces with custom names (e.g., use `{{user}}` for yourself or name your pet!).
- **Customizable Prompts**: Randomly varying hint templates and caption prompts for tailored responses.
- **Custom Idle Hint Templates**: For idle captioning scenarios.
- **Manual Trigger**: "Look" button for on-demand captions, even when auto is disabled.            ![Buttons](https://github.com/grapehonda/Webcam-Caption-for-SillyTavern/blob/main/webcam_caption_server/Screenshots/Buttons.png)
- **Toggle Control**: Easy on/off toggle via camera icon button or hotkey (Alt + W).
- **User-Friendly UI**: Upload photos, regenerate embeddings, and preview webcam directly in settings—no command line required.
- **Local Processing**: Uses KoboldCPP with a vision model; everything runs offline.
- **Configurable Face Detection Threshold**: Adjust the similarity threshold for recognition.

## Requirements

- SillyTavern installed (latest version recommended).
- Python 3.8+ with virtual environment (venv).
- KoboldCPP setup with two instances:
  - Vision model on port 5002 (use `--mmproj` flag).
  - Text model on port 5001.
- Webcam with granted access permissions.
- Python Dependencies: `flask`, `flask-cors`, `opencv-python`, `requests`, `torch`, `insightface`, `onnxruntime-gpu`, `numpy`.

## Installation

### Via Git Clone (Recommended for Developers)

1. Navigate to your SillyTavern extensions directory (typically `SillyTavern/public/extensions/` or `SillyTavern/data/default-user/extensions/`).
2. Clone the repository:
   ```
   git clone https://github.com/grapehonda/Webcam-Caption-for-SillyTavern.git auto_webcam_caption
   ```
3. Enter the server directory:
   ```
   cd auto_webcam_caption/webcam_caption_server
   ```
4. Start the server (this will automatically create and activate a virtual environment, install dependencies if needed):
   - Linux: `./start_server.sh`
   - Windows: `(windows)start_server.bat`

### Manual Download

1. Download the repository as a ZIP from [GitHub](https://github.com/grapehonda/Webcam-Caption-for-SillyTavern/releases).
2. Extract the contents and rename the folder to `auto_webcam_caption` if necessary.
3. Place the `auto_webcam_caption` folder into your SillyTavern extensions directory.
4. Enter the server directory:
   ```
   cd auto_webcam_caption/webcam_caption_server
   ```
5. Start the server (this will automatically create and activate a virtual environment, install dependencies if needed):
   - Linux: `./start_server.sh`
   - Windows: `(windows)start_server.bat`

## Setup Face Recognition (Optional but Recommended)

1. In SillyTavern's extension settings, enable "Face Recognition".
2. Type a name for the person/pet (e.g., `{{user}}` for yourself).
3. Select 5-10 clear photos and click "Upload & Generate" to create embeddings.
4. Optionally delete photos after processing for privacy.
5. Test with the "Preview Webcam" button.

## Usage

- **Toggle Auto-Captioning**: Use the camera icon button or press Alt + W.
- **Manual Caption**: Click the "Look" button to generate a caption on demand (sends a custom trigger message).
- **Customization**: Adjust face recognition toggle, caption frequency, hint templates (include `{{caption}}` placeholder), custom prompts, idle settings, and face detection threshold in settings.
- **Quick Test**: Run this curl command to verify the server:
  ```
  curl -X POST http://127.0.0.1:5000/v1/chat/completions -H "Content-Type: application/json" -d '{"enable_face_check": true}'
  ```

## Notes & Troubleshooting

- **Caption Style**: Short, immersive bullet points from the AI's viewpoint (e.g., "*You're smiling warmly into my eyes*").
- **Tuning Captions**: If results seem off, refine the custom prompt or hint templates in settings.
- **Face Recognition Threshold**: Similarity > 0.55 identifies as "you" (uses "you/your"); otherwise, treats as a stranger. Adjustable in settings.
- **Common Issues**:
  - Confirm webcam permissions in your browser/OS.
  - Ensure KoboldCPP ports (5001, 5002) are available and not in use.
  - The start script handles venv activation automatically.
- **Privacy & Local Operation**: No internet needed; all processing is local.
- **Author**: Gil | **Version**: 1.1

## Contributing

Contributions are welcome! Feel free to submit pull requests for bug fixes, new features, or improvements. Please follow these steps:

1. Fork the repository.
2. Create a feature branch (`git checkout -b feature/YourFeature`).
3. Commit your changes (`git commit -m 'Add YourFeature'`).
4. Push to the branch (`git push origin feature/YourFeature`).
5. Open a pull request.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
