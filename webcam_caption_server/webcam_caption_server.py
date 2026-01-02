import sys
import os
import cv2
import base64
import requests
from flask import Flask, jsonify, request, current_app, json
from flask_cors import CORS
import logging
import torch
from insightface.app import FaceAnalysis
import onnxruntime as ort
import warnings
import shutil

def get_embedding(image_path):
    image = cv2.imread(image_path)
    if image is None:
        print(f"Failed to load image: {image_path}")
        return None
    faces = app_insight.get(image)
    if len(faces) == 0:
        print(f"No face detected in: {image_path}")
        return None
    return torch.tensor(faces[0].normed_embedding).unsqueeze(0)

# Suppress warnings and logging
warnings.filterwarnings('ignore')
ort.set_default_logger_severity(3)
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
os.environ['CUDA_LAUNCH_BLOCKING'] = '1'
logging.getLogger('onnxruntime').setLevel(logging.WARNING)
logging.getLogger('insightface').setLevel(logging.ERROR)
torch.set_printoptions(precision=4, sci_mode=False)

# Set app logging to INFO
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

flask_app = Flask(__name__)
CORS(flask_app, resources={r"/*": {"origins": "*"}})

KOBOLDCPP_URL = "http://localhost:5002/v1/chat/completions"
FLASK_PORT = 5000

PROMPT_FILE = 'custom_prompts.json'

# NEW: Global detection threshold
DET_THRESH = 0.5  # Default global detection threshold

def load_custom_prompts():
    if os.path.exists(PROMPT_FILE):
        with open(PROMPT_FILE, 'r') as f:
            prompts = json.load(f)
            logging.info(f"Loaded custom prompts: {list(prompts.keys())}")
            return prompts
    logging.info("No custom_prompts.json - returning defaults")
    return {"Default": CAPTION_PROMPT}  # Load default if empty

custom_prompts = load_custom_prompts()

CAPTION_PROMPT = (
    "Describe what I see as if I'm in the room with {{user}}, using very short, factual bullet points from my perspective (3-6 bullets max). Vary phrasing for natural flow. Use immersive language like 'you're gazing into my eyes' or 'I'm watching you closely'. "
    "Do not mention 'camera', 'view', 'screen', 'off-camera', 'image', 'photo', 'picture', 'capture', 'snapshot', 'feed', 'frame', 'moment captured', 'display isn't visible', or any photography/visibility terms; describe as my direct observation. "
    "Do not describe gaze as directed off-camera, at a screen, or away from me; always assume direct engagement unless clearly not (e.g., 'your eyes are closed' or 'you're looking down'). "
    "Use 'you' for {{user}} (e.g., 'you're smiling'). Focus on:\n"
    "- You: apparent gender, age range, hair (color, length, style), facial hair, hat/cap, glasses.\n"
    "- Your facial expression, emotion, and head pose (e.g., 'you're smiling warmly into my eyes', 'your head tilted curiously').\n"
    "- Your hand positions, exact gestures, and any held objects (e.g., 'you're holding a red mug with both hands').\n"
    "- Your clothing: only general colors and style (e.g., 'your dark hoodie', 'casual pants'). DO NOT describe text, logos, or patterns.\n"
    "- Background: room type, walls, furniture, TV/monitor (note if on/off, no content details), lighting, visible objects or changes.\n"
    "Be conservative; only describe what's clearly visible. Infer basic emotions like you're happy, neutral, focused, or tired."
)

# Suppress stdout/stderr for noisy sections
class SuppressOutput:
    def __enter__(self):
        self.original_stdout = sys.stdout
        self.original_stderr = sys.stderr
        sys.stdout = open(os.devnull, 'w')
        sys.stderr = open(os.devnull, 'w')
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        sys.stdout.close()
        sys.stderr.close()
        sys.stdout = self.original_stdout
        sys.stderr = self.original_stderr

# Import and init noisy libraries inside suppressor
with SuppressOutput():
    app_insight = FaceAnalysis(name='antelopev2')
    app_insight.prepare(ctx_id=0, det_size=(640, 640), det_thresh=DET_THRESH)  # NEW: Use global DET_THRESH (was 0.3)

# Global known embeddings dict {name: {'emb': tensor, 'th': float}}
known_embeddings = {}

def load_known_embeddings():
    known_embeddings.clear()
    known_folder = 'known_faces'
    os.makedirs(known_folder, exist_ok=True)
    for filename in os.listdir(known_folder):
        if filename.endswith('.pth'):
            path = os.path.join(known_folder, filename)
            data = torch.load(path)
            name = filename[:-4]
            known_embeddings[name] = {'emb': data['emb'], 'th': data.get('th', 0.55)}
    logging.info(f"Loaded {len(known_embeddings)} known embeddings.")

load_known_embeddings()  # Load at startup

@flask_app.route('/v1/chat/completions', methods=['POST'])
def get_caption():
    logging.info("Received caption request")
    data = request.get_json() or {}
    enable_face_check = data.get('enable_face_check', True)
    logging.info(f"enable_face_check: {enable_face_check}")
    caption_prompt = data.get('caption_prompt')
    caption = generate_caption(enable_face_check, caption_prompt)
    response = {
        "choices": [
            {
                "message": {
                    "content": caption
                }
            }
        ]
    }
    return current_app.response_class(json.dumps(response, ensure_ascii=False), mimetype='application/json')

def generate_caption(enable_face_check, caption_prompt=None):
    # Determine the prompt to use
    if caption_prompt is None or caption_prompt.strip() == '':
        selected_prompt = CAPTION_PROMPT
        logging.info("Using default caption prompt for fallback")
    else:
        selected_prompt = caption_prompt

    # Capture webcam frame
    logging.info("Capturing webcam frame...")
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        logging.error("Webcam not accessible")
        return "Error: Webcam not accessible"
    
    ret, frame = cap.read()
    cap.release()
    if not ret:
        logging.error("Webcam capture failed")
        return "Error: Webcam capture failed"
    
    # Save temp image for processing
    temp_path = 'temp.jpg'
    cv2.imwrite(temp_path, frame)
    
    # Extract embedding
    logging.info("Detecting faces...")
    with SuppressOutput():
        image = cv2.imread(temp_path)
        faces = app_insight.get(image)
    
    os.remove(temp_path)  # Clean up
    
    if len(faces) == 0:
        logging.info("No face detected - skipping recognition")
        return "No face detected"
    
    logging.info(f"{len(faces)} faces detected")
    
    # Extract embeddings for all faces
    embs = [torch.tensor(f.normed_embedding).unsqueeze(0) for f in faces]
    
    # Face recognition if enabled
    is_known = False
    recognized_names = []
    if enable_face_check and known_embeddings:
        logging.info(f"Running face recognition against {len(known_embeddings)} known embeddings for {len(embs)} faces")
        for idx, emb in enumerate(embs):
            logging.info(f"Processing face {idx + 1} (det_score: {faces[idx].det_score:.4f})")
            max_similarity = -1
            best_name = None
            for name, data in known_embeddings.items():
                ref_embedding = data['emb']
                similarity = torch.nn.functional.cosine_similarity(emb, ref_embedding).item()
                logging.info(f"Similarity with {name}: {similarity:.4f}")
                if similarity > max_similarity:
                    max_similarity = similarity
                    best_name = name
            if best_name and max_similarity > known_embeddings[best_name]['th']:
                is_known = True
                recognized_names.append(best_name)
                logging.info(f"Match found for face {idx + 1}: {best_name} (similarity: {max_similarity:.4f})")
    
    if not is_known:
        logging.info("No matches found across all faces - using stranger mode")
    else:
        logging.info(f"Known faces recognized: {recognized_names}")
    
    # Choose prompt based on recognition if using default
    if caption_prompt is None or caption_prompt.strip() == '':
        if is_known:
            final_prompt = custom_prompts.get('Default', CAPTION_PROMPT)
            logging.info("Using Default (user) prompt due to match")
        else:
            final_prompt = custom_prompts.get('Stranger Mode', CAPTION_PROMPT)
            logging.info("Using Stranger Mode prompt")
    else:
        final_prompt = selected_prompt
        logging.info("Using provided custom prompt")
    
    # If known faces recognized, replace {{user}} with the recognized name(s)
    if is_known:
        # For simplicity, use the first recognized name if multiple; adjust as needed
        name_to_use = recognized_names[0] if recognized_names else "{{user}}"
        final_prompt = final_prompt.replace("{{user}}", name_to_use)
        logging.info(f"Replaced {{user}} with {name_to_use} in prompt")

    # Encode image to base64 for KoboldCPP
    _, buffer = cv2.imencode('.jpg', frame)
    base64_image = base64.b64encode(buffer).decode('utf-8')
    
    # Payload for KoboldCPP
    payload = {
        "messages": [{"role": "user", "content": final_prompt}],
        "images": [base64_image],
        "max_tokens": 200,
    }
    
    try:
        logging.info("Sending request to KoboldCPP...")
        response = requests.post(KOBOLDCPP_URL, json=payload)
        response.raise_for_status()
        caption = response.json()['choices'][0]['message']['content']
        logging.info(f"Caption generated: {caption[:100]}...")
        return caption
    except requests.ConnectionError:
        logging.error("Connection error to KoboldCPP — is it running on port 5002?")
        return "Error: Connection error to vision model"
    except Exception as e:
        logging.error(f"Vision error: {e}")
        return "Error generating caption."

@flask_app.route('/add_person', methods=['POST'])
def add_person():
    name = request.form.get('name')
    if not name:
        return jsonify({"status": "error", "message": "Name required"}), 400

    photos = request.files.getlist('photos')
    if not photos:
        return jsonify({"status": "error", "message": "No photos uploaded"}), 400

    temp_folder = 'temp_photos'
    os.makedirs(temp_folder, exist_ok=True)
    saved_files = []
    for file in photos:
        if file.filename.lower().endswith(('.jpg', '.jpeg', '.png')):
            path = os.path.join(temp_folder, file.filename)
            file.save(path)
            saved_files.append(path)

    if not saved_files:
        shutil.rmtree(temp_folder)
        return jsonify({"status": "error", "message": "No valid photos"}), 400

    try:
        embeddings = []
        for path in saved_files:
            emb = get_embedding(path)
            if emb is not None:
                embeddings.append(emb)

        if not embeddings:
            raise ValueError("No valid embeddings from photos.")

        stacked = torch.cat(embeddings, dim=0)
        avg_emb = torch.mean(stacked, dim=0).unsqueeze(0)
        data = {'emb': avg_emb, 'th': 0.55}
        known_folder = 'known_faces'
        os.makedirs(known_folder, exist_ok=True)
        torch.save(data, os.path.join(known_folder, f"{name}.pth"))
        load_known_embeddings()
        return jsonify({"status": "success", "message": f"Added {name} with {len(embeddings)} photos"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        shutil.rmtree(temp_folder)

@flask_app.route('/list_known', methods=['GET'])
def list_known():
    return jsonify([{"name": name, "threshold": d['th']} for name, d in known_embeddings.items()])

@flask_app.route('/update_threshold', methods=['POST'])
def update_threshold():
    data = request.get_json()
    name = data.get('name')
    new_th = data.get('threshold')
    if not name or new_th is None:
        return jsonify({"status": "error", "message": "Name and threshold required"}), 400
    if name not in known_embeddings:
        return jsonify({"status": "error", "message": "Person not found"}), 404

    path = os.path.join('known_faces', f"{name}.pth")
    data = torch.load(path)
    data['th'] = float(new_th)
    torch.save(data, path)
    load_known_embeddings()
    return jsonify({"status": "success", "message": f"Updated threshold for {name} to {new_th}"})

@flask_app.route('/delete_person', methods=['POST'])
def delete_person():
    data = request.get_json()
    name = data.get('name')
    if not name:
        return jsonify({"status": "error", "message": "Name required"}), 400
    path = os.path.join('known_faces', f"{name}.pth")
    if os.path.exists(path):
        os.remove(path)
        load_known_embeddings()
        return jsonify({"status": "success", "message": f"Deleted {name}"})
    return jsonify({"status": "error", "message": "Person not found"}), 404

@flask_app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok", "message": "Caption server ready"})

@flask_app.route('/save_prompt', methods=['POST'])
def save_prompt():
    data = request.get_json()
    name = data.get('name')
    prompt = data.get('prompt')
    if not name or not prompt:
        return jsonify({"status": "error", "message": "Name and prompt required"}), 400
    custom_prompts[name] = prompt
    with open(PROMPT_FILE, 'w') as f:
        json.dump(custom_prompts, f)
    return jsonify({"status": "success", "message": f"Saved {name}"})

@flask_app.route('/list_prompts', methods=['GET'])
def list_prompts():
    return jsonify(custom_prompts)

# NEW: Endpoint to update global det threshold
@flask_app.route('/update_det_threshold', methods=['POST'])
def update_det_threshold():
    global DET_THRESH, app_insight
    data = request.get_json()
    new_th = data.get('threshold')
    if new_th is None or not (0.1 <= new_th <= 0.9):
        return jsonify({"status": "error", "message": "Invalid threshold (0.1-0.9)"}), 400
    DET_THRESH = float(new_th)
    # Reinitialize model with new threshold
    with SuppressOutput():
        app_insight = FaceAnalysis(name='antelopev2')
        app_insight.prepare(ctx_id=0, det_size=(640, 640), det_thresh=DET_THRESH)
    logging.info(f"Updated global det_thresh to {DET_THRESH}")
    return jsonify({"status": "success", "message": f"Updated to {DET_THRESH}"})

if __name__ == '__main__':
    print("Caption server running - on-demand")
    flask_app.run(host='0.0.0.0', port=FLASK_PORT)

