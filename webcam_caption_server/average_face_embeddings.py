import torch
import cv2
import os
from insightface.app import FaceAnalysis
import numpy as np

# Initialize InsightFace (global, but called once)
app = FaceAnalysis(name='antelopev2')
app.prepare(ctx_id=0, det_size=(640, 640))

def get_embedding(image_path):
    image = cv2.imread(image_path)
    if image is None:
        print(f"Failed to load image: {image_path}")
        return None
    faces = app.get(image)
    if len(faces) == 0:
        print(f"No face detected in: {image_path}")
        return None
    return torch.tensor(faces[0].normed_embedding).unsqueeze(0)
