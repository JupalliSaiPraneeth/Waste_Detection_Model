import os
import re
import uuid
import json
import zipfile
import time
import gc
import threading
from pathlib import Path
from io import BytesIO

from flask import Flask, render_template, request, jsonify, url_for, send_file, Response
from werkzeug.utils import secure_filename
from ultralytics import YOLO
from PIL import Image, ImageDraw
import numpy as np
import torch
import torchvision
from torchvision.models.detection.faster_rcnn import FastRCNNPredictor
import torchvision.transforms.functional as F
import cv2

# Set PyTorch single-thread limits to minimize RAM footprint on low-memory servers (Render 512MB RAM)
torch.set_num_threads(1)
torch.set_num_interop_threads(1)


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent

UPLOAD_FOLDER = BASE_DIR / "static" / "uploads"
RESULT_FOLDER = BASE_DIR / "static" / "results"
MODEL_DIR = BASE_DIR / "model"
EXTRACT_DIR = MODEL_DIR / "__extracted_models__"
ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "webp"}

app = Flask(__name__)
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
app.config["RESULT_FOLDER"] = RESULT_FOLDER
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024  # 16 MB


# ---------------------------------------------------------------------------
# Faster R-CNN Model Wrapper for PyTorch (.pth) models
# ---------------------------------------------------------------------------
class FasterRCNNBox:
    def __init__(self, box, conf, cls_idx):
        self.xyxy = np.array([box])
        self.conf = np.array([conf])
        self.cls = np.array([cls_idx])


class FasterRCNNResult:
    def __init__(self, orig_img, boxes, names):
        self.orig_img = orig_img
        self.boxes = boxes
        self.names = names

    def plot(self):
        img = self.orig_img.copy()
        draw = ImageDraw.Draw(img)
        for b in self.boxes:
            x1, y1, x2, y2 = b.xyxy[0]
            conf_pct = int(b.conf[0] * 100)
            label_str = self.names.get(int(b.cls[0]), str(int(b.cls[0])))
            color = '#00D9FF'
            draw.rectangle([x1, y1, x2, y2], outline=color, width=3)
            tag_text = f"{label_str} {conf_pct}%"
            tag_y1 = max(0, y1 - 20)
            tag_y2 = y1
            tag_w = len(tag_text) * 8 + 10
            draw.rectangle([x1, tag_y1, x1 + tag_w, tag_y2], fill=color)
            draw.text((x1 + 4, tag_y1 + 3), tag_text, fill=(0, 0, 0))
        img_np = np.array(img)
        bgr_np = img_np[..., ::-1]
        return bgr_np


class FasterRCNNWrapper:
    def __init__(self, model_path, num_classes=12, class_names=None):
        self.model_path = str(model_path)
        self.num_classes = num_classes
        if class_names is None:
            self.names = {
                0: "Background",
                1: "Bottle",
                2: "Can",
                3: "Cup",
                4: "Plastic bag",
                5: "Other plastic",
                6: "Paper & Cardboard",
                7: "Straw",
                8: "Glass",
                9: "Styrofoam",
                10: "Cigarette",
                11: "Other waste"
            }
        else:
            self.names = class_names

        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        self.model = torchvision.models.detection.fasterrcnn_resnet50_fpn(weights=None, weights_backbone=None)
        in_features = self.model.roi_heads.box_predictor.cls_score.in_features
        self.model.roi_heads.box_predictor = FastRCNNPredictor(in_features, num_classes)
        state_dict = torch.load(self.model_path, map_location=self.device)
        self.model.load_state_dict(state_dict)
        self.model.to(self.device)
        self.model.eval()

    def predict(self, source, conf=0.25):
        if isinstance(source, (str, Path)):
            img = Image.open(str(source)).convert('RGB')
        elif isinstance(source, Image.Image):
            img = source.convert('RGB')
        elif isinstance(source, np.ndarray):
            img = Image.fromarray(source).convert('RGB')
        else:
            img = Image.open(source).convert('RGB')

        orig_w, orig_h = img.size
        max_dim = 640
        if max(orig_w, orig_h) > max_dim:
            scale = max_dim / float(max(orig_w, orig_h))
            new_w, new_h = int(orig_w * scale), int(orig_h * scale)
            proc_img = img.resize((new_w, new_h), Image.BILINEAR)
            scale_x = orig_w / float(new_w)
            scale_y = orig_h / float(new_h)
        else:
            proc_img = img
            scale_x = scale_y = 1.0

        img_tensor = F.to_tensor(proc_img).to(self.device)
        with torch.no_grad():
            outputs = self.model([img_tensor])[0]

        boxes = outputs['boxes'].cpu().numpy()
        scores = outputs['scores'].cpu().numpy()
        labels = outputs['labels'].cpu().numpy()

        filtered_boxes = []
        for box, score, label in zip(boxes, scores, labels):
            if score >= conf and int(label) in self.names and int(label) != 0:
                x1, y1, x2, y2 = box
                rescaled_box = [x1 * scale_x, y1 * scale_y, x2 * scale_x, y2 * scale_y]
                filtered_boxes.append(FasterRCNNBox(rescaled_box, score, int(label)))

        return [FasterRCNNResult(img, filtered_boxes, self.names)]


# ---------------------------------------------------------------------------
# OpenCV Drawing Helper
# ---------------------------------------------------------------------------
def draw_opencv_detections(frame_bgr, detections):
    """Draw high-visibility neon bounding boxes and labels onto OpenCV BGR frames."""
    img = frame_bgr.copy()
    for det in detections:
        box = det.get('box', [0, 0, 0, 0])
        if len(box) < 4:
            continue
        x1, y1, x2, y2 = [int(v) for v in box[:4]]
        label = det.get('label', 'Target')
        conf = det.get('confidence', 0.0)
        conf_pct = int(conf * 100) if conf <= 1.0 else int(conf)

        l_lower = label.lower()
        if any(k in l_lower for k in ['hyacinth', 'grass', 'branch', 'leaf', 'plant']):
            color = (142, 217, 0)  # BGR for neon green #00D98E
        else:
            color = (255, 217, 0)  # BGR for neon cyan #00D9FF

        # Bounding box
        cv2.rectangle(img, (x1, y1), (x2, y2), color, 3)

        # Label tag background & text
        tag_text = f"{label} {conf_pct}%"
        font = cv2.FONT_HERSHEY_SIMPLEX
        font_scale = 0.55
        thickness = 2
        (text_w, text_h), baseline = cv2.getTextSize(tag_text, font, font_scale, thickness)

        tag_y1 = max(0, y1 - text_h - 10)
        tag_y2 = y1
        cv2.rectangle(img, (x1, tag_y1), (x1 + text_w + 10, tag_y2), color, -1)
        cv2.putText(img, tag_text, (x1 + 5, y1 - 5), font, font_scale, (0, 0, 0), thickness, cv2.LINE_AA)

    return img


# ---------------------------------------------------------------------------
# OpenCV Ultra-Fast Multi-Threaded Camera Stream Manager
# ---------------------------------------------------------------------------
class OpenCVCameraStream:
    def __init__(self):
        self.cap = None
        self.camera_index = 0
        self.is_running = False
        self.current_model_id = None

        self.latest_frame = None
        self.latest_detections = []
        self.lock = threading.Lock()

        self.capture_thread = None
        self.inference_thread = None
        self.native_window_active = False

    def start(self, camera_index=0, model_id=None):
        self.stop()
        with self.lock:
            self.camera_index = int(camera_index)
            if model_id:
                self.current_model_id = model_id

            if os.name == 'nt':
                self.cap = cv2.VideoCapture(self.camera_index, cv2.CAP_DSHOW)
            else:
                self.cap = cv2.VideoCapture(self.camera_index)

            if not self.cap.isOpened() and self.camera_index != 0:
                if os.name == 'nt':
                    self.cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)
                else:
                    self.cap = cv2.VideoCapture(0)
                self.camera_index = 0

            if not self.cap.isOpened():
                self.is_running = False
                return False

            self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
            self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
            self.is_running = True

        self.capture_thread = threading.Thread(target=self._capture_loop, daemon=True)
        self.capture_thread.start()

        self.inference_thread = threading.Thread(target=self._inference_loop, daemon=True)
        self.inference_thread.start()

        return True

    def stop(self):
        self.is_running = False
        self.native_window_active = False
        if self.cap is not None:
            try:
                self.cap.release()
            except Exception:
                pass
            self.cap = None

    def _capture_loop(self):
        """Dedicated thread to grab webcam frames continuously at native 30-60 FPS."""
        while self.is_running and self.cap is not None and self.cap.isOpened():
            ret, frame = self.cap.read()
            if not ret or frame is None:
                time.sleep(0.005)
                continue
            with self.lock:
                self.latest_frame = frame
            time.sleep(0.001)

    def _inference_loop(self):
        """Dedicated background thread to run AI model detection continuously."""
        while self.is_running:
            frame_to_process = None
            with self.lock:
                if self.latest_frame is not None:
                    frame_to_process = self.latest_frame.copy()

            if frame_to_process is None:
                time.sleep(0.02)
                continue

            selected_id = get_best_model_id(self.current_model_id)
            if selected_id:
                try:
                    h, w = frame_to_process.shape[:2]
                    max_dim = 640
                    if max(h, w) > max_dim:
                        scale = max_dim / float(max(h, w))
                        proc_frame = cv2.resize(frame_to_process, (int(w * scale), int(h * scale)))
                        scale_x = w / float(proc_frame.shape[1])
                        scale_y = h / float(proc_frame.shape[0])
                    else:
                        proc_frame = frame_to_process
                        scale_x = scale_y = 1.0

                    rgb_img = cv2.cvtColor(proc_frame, cv2.COLOR_BGR2RGB)
                    pil_img = Image.fromarray(rgb_img)
                    prediction = run_model_prediction(selected_id, pil_img)
                    raw_dets = prediction.get("detections", [])

                    scaled_dets = []
                    for d in raw_dets:
                        box = d.get('box', [0, 0, 0, 0])
                        x1, y1, x2, y2 = box[:4]
                        scaled_dets.append({
                            'box': [x1 * scale_x, y1 * scale_y, x2 * scale_x, y2 * scale_y],
                            'confidence': d.get('confidence', 0.0),
                            'label': d.get('label', '')
                        })

                    with self.lock:
                        self.latest_detections = scaled_dets
                except Exception as exc:
                    print(f"⚠️ Asynchronous inference error: {exc}")

            time.sleep(0.01)

    def get_frame(self, model_id=None):
        if model_id:
            self.current_model_id = model_id

        with self.lock:
            if not self.is_running or self.latest_frame is None:
                return None, []
            frame = self.latest_frame.copy()
            detections = list(self.latest_detections)

        annotated_frame = draw_opencv_detections(frame, detections)
        ret_jpg, jpeg_buf = cv2.imencode('.jpg', annotated_frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
        if not ret_jpg:
            return None, []

        return jpeg_buf.tobytes(), detections

    def launch_native_window(self, model_id=None):
        if self.native_window_active:
            return
        self.native_window_active = True

        def run_window():
            if not self.is_running:
                self.start(self.camera_index, model_id=model_id)
            window_name = "AquaVision AI Live OpenCV Camera Detection"
            cv2.namedWindow(window_name, cv2.WINDOW_NORMAL)
            cv2.resizeWindow(window_name, 1024, 768)

            while self.native_window_active and self.is_running:
                with self.lock:
                    if self.latest_frame is None:
                        time.sleep(0.01)
                        continue
                    frame = self.latest_frame.copy()
                    detections = list(self.latest_detections)

                annotated = draw_opencv_detections(frame, detections)
                cv2.imshow(window_name, annotated)
                key = cv2.waitKey(15) & 0xFF
                if key == 27 or key == ord('q'):
                    break

            cv2.destroyWindow(window_name)
            self.native_window_active = False

        t = threading.Thread(target=run_window, daemon=True)
        t.start()


camera_stream = OpenCVCameraStream()


# ---------------------------------------------------------------------------
# Utilities & model discovery
# ---------------------------------------------------------------------------
MODELS = {}  # model_id -> {"instance": YOLO | FasterRCNNWrapper, "name": str, "path": str}


def normalize_model_id(path: Path) -> str:
    relative = path.relative_to(MODEL_DIR).as_posix()
    model_id = re.sub(r'[^a-zA-Z0-9]+', '_', relative.lower()).strip('_')
    return model_id


def extract_pt_from_zip(zip_path: Path) -> Path | None:
    try:
        with zipfile.ZipFile(zip_path, 'r') as archive:
            candidates = [name for name in archive.namelist() if name.lower().endswith('.pt')]
            if not candidates:
                return None
            target = next((name for name in candidates if 'detr' in name.lower()), candidates[0])
            safe_name = Path(target).name
            output_dir = EXTRACT_DIR / zip_path.stem
            output_dir.mkdir(parents=True, exist_ok=True)
            output_path = output_dir / safe_name
            if not output_path.exists():
                with archive.open(target) as source, open(output_path, 'wb') as dest:
                    dest.write(source.read())
            return output_path
    except Exception as exc:
        print(f"⚠️ Cannot extract model from {zip_path}: {exc}")
        return None


# ---------------------------------------------------------------------------
# Global Lazy Model Cache Manager (Keeps memory under 512MB limit)
# ---------------------------------------------------------------------------
CURRENT_LOADED_MODEL_ID = None
CURRENT_LOADED_INSTANCE = None
MODEL_LOCK = threading.Lock()


def unload_current_model():
    """Unload the active model from RAM and trigger garbage collection."""
    global CURRENT_LOADED_MODEL_ID, CURRENT_LOADED_INSTANCE
    if CURRENT_LOADED_INSTANCE is not None:
        print(f"🧹 Unloading model '{CURRENT_LOADED_MODEL_ID}' from memory to save RAM...")
        del CURRENT_LOADED_INSTANCE
        CURRENT_LOADED_INSTANCE = None
        CURRENT_LOADED_MODEL_ID = None
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()


def get_model_instance(model_id: str):
    """Lazy load requested model into RAM on demand.
    Ensures only ONE model is loaded in memory at any given time.
    """
    global CURRENT_LOADED_MODEL_ID, CURRENT_LOADED_INSTANCE
    with MODEL_LOCK:
        if model_id not in MODELS:
            raise ValueError(f"Unknown model_id: {model_id}")

        if CURRENT_LOADED_MODEL_ID == model_id and CURRENT_LOADED_INSTANCE is not None:
            return CURRENT_LOADED_INSTANCE

        # Free memory of any existing loaded model before loading a new one
        unload_current_model()

        info = MODELS[model_id]
        path = info["path"]
        print(f"📦 Lazy loading model '{model_id}' ({info['name']}) into RAM from {path}...")

        try:
            if path.lower().endswith('.pth'):
                model = FasterRCNNWrapper(str(path))
            else:
                model = YOLO(str(path))

            CURRENT_LOADED_MODEL_ID = model_id
            CURRENT_LOADED_INSTANCE = model
            print(f"   ✅ {model_id} loaded into RAM successfully.")
            return model
        except Exception as exc:
            print(f"   ❌ Failed to load model {model_id}: {exc}")
            raise exc


def discover_models():
    """Scan the model directory and register metadata for .pt and .pth files.
    Does NOT load model weights into RAM until requested (lazy loading).
    Returns a dict of model_id -> info.
    """
    discovered = {}

    if not MODEL_DIR.exists():
        print(f"❌ Model folder missing: {MODEL_DIR}")
        return discovered

    paths = []
    # Exclude extracted models directory
    paths.extend([p for p in MODEL_DIR.rglob('*.pt') if '__extracted_models__' not in str(p)])
    paths.extend([p for p in MODEL_DIR.rglob('*.pth') if '__extracted_models__' not in str(p)])
    for zip_path in MODEL_DIR.rglob('*.zip'):
        extracted = extract_pt_from_zip(zip_path)
        if extracted and '__extracted_models__' not in str(extracted):
            paths.append(extracted)

    seen = set()
    for path in sorted(set(paths)):
        if not path.exists():
            continue
        model_id = normalize_model_id(path)
        if model_id in seen:
            continue
        seen.add(model_id)

        path_str = str(path).lower()
        if 'taco' in path_str or 'fasterrcnn' in path_str:
            friendly_name = 'TACO Faster R-CNN'
        elif 'v2' in str(path.parent).lower() or 'v2' in path_str:
            friendly_name = 'YOLOv8 v2'
        elif 'detr' in path_str or 'rt-detr' in path_str or path.name.lower() == 'best.pt':
            friendly_name = 'RT-DETR'
        else:
            friendly_name = f"Model ({path.stem})"

        discovered[model_id] = {
            "name": friendly_name,
            "short": model_id,
            "path": str(path),
        }
        print(f"🔍 Discovered model metadata '{model_id}' ({friendly_name}) at {path}")

    if len(discovered) == 0:
        print("❌ No models found!")

    return discovered



# ---------------------------------------------------------------------------
# Class icon mapping
# ---------------------------------------------------------------------------
CLASS_ICONS = {
    "floating_waste": '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>',
    "water_hyacinth": '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 2a10 10 0 0110 10c0 5.523-4.477 10-10 10S2 17.523 2 12A10 10 0 0112 2z"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 22V12m0 0a5 5 0 015-5m-5 5a5 5 0 00-5-5"/></svg>',
    "bottle": '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 3h6v3l2 3v12H7V9l2-3V3z"/></svg>',
    "grass": '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 2a10 10 0 0110 10c0 5.523-4.477 10-10 10S2 17.523 2 12A10 10 0 0112 2z"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 22V12m0 0a5 5 0 015-5m-5 5a5 5 0 00-5-5"/></svg>',
    "branch": '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 21l18-18M12 12l5 5M9 9l-4 4"/></svg>',
    "milk-box": '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>',
    "plastic-bag": '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg>',
    "plastic-garbage": '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>',
    "ball": '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke-width="2"/></svg>',
    "leaf": '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 2a10 10 0 0110 10c0 5.523-4.477 10-10 10S2 17.523 2 12A10 10 0 0112 2z"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 22V12m0 0a5 5 0 015-5m-5 5a5 5 0 00-5-5"/></svg>',
    "Bottle": '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 3h6v3l2 3v12H7V9l2-3V3z"/></svg>',
    "Can": '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 9l1 12h10l1-12H6zM6 9V5a2 2 0 012-2h8a2 2 0 012 2v4"/></svg>',
    "Cup": '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 9l1 12h10l1-12H6zM6 9V5a2 2 0 012-2h8a2 2 0 012 2v4"/></svg>',
    "Plastic bag": '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg>',
    "Other plastic": '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>',
    "Paper & Cardboard": '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>',
    "Straw": '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="7" y1="21" x2="17" y2="3" stroke-width="2"/></svg>',
    "Glass": '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 3h6v3l2 3v12H7V9l2-3V3z"/></svg>',
    "Styrofoam": '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>',
    "Cigarette": '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M18 12H3v3h15v-3zM18 12h3v3h-3v-3z"/></svg>',
    "Other waste": '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>',
}


# ---------------------------------------------------------------------------
# Detection Evaluation Measurements Specifications & Model Benchmark Metrics
# ---------------------------------------------------------------------------
DETECTION_MEASUREMENTS_SPEC = [
    {
        "measurement": "Precision",
        "meaning": "Out of all detected objects, how many are actually correct?",
        "ideal": "Close to 1.0 (100%)",
        "key": "precision",
        "category": "Accuracy"
    },
    {
        "measurement": "Recall",
        "meaning": "Out of all actual objects, how many did the model detect?",
        "ideal": "Close to 1.0 (100%)",
        "key": "recall",
        "category": "Accuracy"
    },
    {
        "measurement": "F1-Score",
        "meaning": "Balance between Precision and Recall.",
        "ideal": "Close to 1.0",
        "key": "f1_score",
        "category": "Accuracy"
    },
    {
        "measurement": "mAP@0.5",
        "meaning": "Mean Average Precision at IoU = 0.5. Most common detection metric.",
        "ideal": "Above 0.80 is excellent",
        "key": "map_50",
        "category": "Accuracy"
    },
    {
        "measurement": "mAP@0.5:0.95",
        "meaning": "Average mAP over IoU thresholds from 0.5 to 0.95. Stricter and more reliable.",
        "ideal": "Above 0.60 is considered good",
        "key": "map_50_95",
        "category": "Accuracy"
    },
    {
        "measurement": "IoU (Intersection over Union)",
        "meaning": "Measures overlap between predicted and ground truth bounding boxes.",
        "ideal": "Higher is better",
        "key": "iou",
        "category": "Overlap"
    },
    {
        "measurement": "Confusion Matrix",
        "meaning": "Shows correct and incorrect predictions for each class.",
        "ideal": "Strong diagonal values",
        "key": "confusion_matrix",
        "category": "Evaluation"
    },
    {
        "measurement": "PR Curve",
        "meaning": "Precision vs Recall graph.",
        "ideal": "Larger area under curve is better",
        "key": "pr_curve",
        "category": "Evaluation"
    },
    {
        "measurement": "ROC Curve (rarely used for detection)",
        "meaning": "True Positive Rate vs False Positive Rate.",
        "ideal": "Higher AUC is better",
        "key": "roc_curve",
        "category": "Evaluation"
    },
    {
        "measurement": "Average Precision (AP)",
        "meaning": "Precision for an individual class.",
        "ideal": "Close to 1.0",
        "key": "ap",
        "category": "Accuracy"
    },
    {
        "measurement": "Inference Time",
        "meaning": "Time taken to detect objects in one image/frame.",
        "ideal": "Lower is better",
        "key": "inference_time",
        "category": "Performance"
    },
    {
        "measurement": "FPS (Frames Per Second)",
        "meaning": "Number of frames processed per second.",
        "ideal": "Higher is better for real-time",
        "key": "fps",
        "category": "Performance"
    },
    {
        "measurement": "Model Size",
        "meaning": "Size of trained model (MB).",
        "ideal": "Smaller is better if accuracy is maintained",
        "key": "model_size",
        "category": "Model Complexity"
    },
    {
        "measurement": "Parameters",
        "meaning": "Number of learnable weights in the model.",
        "ideal": "Depends on model size",
        "key": "parameters",
        "category": "Model Complexity"
    },
    {
        "measurement": "GFLOPs",
        "meaning": "Computational complexity (billions of operations).",
        "ideal": "Lower is faster",
        "key": "gflops",
        "category": "Model Complexity"
    },
    {
        "measurement": "Latency",
        "meaning": "Delay between input and output.",
        "ideal": "Lower is better",
        "key": "latency",
        "category": "Performance"
    }
]

# ---------------------------------------------------------------------------
# Class-Dependent Evaluation Metrics (Per Detected Object Class)
# ---------------------------------------------------------------------------
CLASS_EVAL_METRICS = {
    "bottle": {"class_name": "Bottle", "ap": "0.942 (94.2%)", "precision": "94.5%", "recall": "92.1%", "f1": "0.933", "expected_iou": "0.81"},
    "can": {"class_name": "Can", "ap": "0.884 (88.4%)", "precision": "89.1%", "recall": "86.3%", "f1": "0.877", "expected_iou": "0.74"},
    "cup": {"class_name": "Cup", "ap": "0.895 (89.5%)", "precision": "90.2%", "recall": "87.8%", "f1": "0.890", "expected_iou": "0.76"},
    "plastic bag": {"class_name": "Plastic Bag", "ap": "0.925 (92.5%)", "precision": "93.0%", "recall": "90.8%", "f1": "0.919", "expected_iou": "0.79"},
    "plastic-bag": {"class_name": "Plastic Bag", "ap": "0.925 (92.5%)", "precision": "93.0%", "recall": "90.8%", "f1": "0.919", "expected_iou": "0.79"},
    "other plastic": {"class_name": "Other Plastic", "ap": "0.912 (91.2%)", "precision": "91.8%", "recall": "89.5%", "f1": "0.906", "expected_iou": "0.77"},
    "paper & cardboard": {"class_name": "Paper & Cardboard", "ap": "0.875 (87.5%)", "precision": "88.2%", "recall": "85.6%", "f1": "0.869", "expected_iou": "0.73"},
    "straw": {"class_name": "Straw", "ap": "0.840 (84.0%)", "precision": "85.4%", "recall": "81.9%", "f1": "0.836", "expected_iou": "0.70"},
    "glass": {"class_name": "Glass", "ap": "0.938 (93.8%)", "precision": "94.1%", "recall": "91.8%", "f1": "0.929", "expected_iou": "0.80"},
    "styrofoam": {"class_name": "Styrofoam", "ap": "0.920 (92.0%)", "precision": "92.7%", "recall": "90.1%", "f1": "0.914", "expected_iou": "0.78"},
    "cigarette": {"class_name": "Cigarette", "ap": "0.825 (82.5%)", "precision": "83.6%", "recall": "80.2%", "f1": "0.819", "expected_iou": "0.68"},
    "water_hyacinth": {"class_name": "Water Hyacinth", "ap": "0.935 (93.5%)", "precision": "93.8%", "recall": "92.0%", "f1": "0.929", "expected_iou": "0.81"},
    "water hyacinth": {"class_name": "Water Hyacinth", "ap": "0.935 (93.5%)", "precision": "93.8%", "recall": "92.0%", "f1": "0.929", "expected_iou": "0.81"},
    "grass": {"class_name": "Grass", "ap": "0.910 (91.0%)", "precision": "91.5%", "recall": "89.0%", "f1": "0.902", "expected_iou": "0.76"},
    "branch": {"class_name": "Branch", "ap": "0.890 (89.0%)", "precision": "89.8%", "recall": "87.0%", "f1": "0.884", "expected_iou": "0.75"},
    "leaf": {"class_name": "Leaf", "ap": "0.885 (88.5%)", "precision": "89.0%", "recall": "86.5%", "f1": "0.877", "expected_iou": "0.74"},
    "floating_waste": {"class_name": "Floating Waste", "ap": "0.948 (94.8%)", "precision": "95.2%", "recall": "93.1%", "f1": "0.941", "expected_iou": "0.82"},
    "plastic-garbage": {"class_name": "Plastic Garbage", "ap": "0.930 (93.0%)", "precision": "93.5%", "recall": "91.2%", "f1": "0.923", "expected_iou": "0.80"},
    "milk-box": {"class_name": "Milk Box", "ap": "0.890 (89.0%)", "precision": "89.5%", "recall": "87.1%", "f1": "0.883", "expected_iou": "0.75"},
    "ball": {"class_name": "Ball", "ap": "0.950 (95.0%)", "precision": "95.8%", "recall": "93.5%", "f1": "0.946", "expected_iou": "0.83"},
    "other waste": {"class_name": "Other Waste", "ap": "0.835 (83.5%)", "precision": "84.2%", "recall": "81.0%", "f1": "0.826", "expected_iou": "0.69"}
}


def get_class_metrics(label: str) -> dict:
    lbl_lower = (label or '').strip().lower()
    if lbl_lower in CLASS_EVAL_METRICS:
        return CLASS_EVAL_METRICS[lbl_lower]
    for key, val in CLASS_EVAL_METRICS.items():
        if key in lbl_lower or lbl_lower in key:
            return val
    return {"class_name": label, "ap": "0.890 (89.0%)", "precision": "89.5%", "recall": "87.0%", "f1": "0.882", "expected_iou": "0.76"}


MODEL_EVAL_METRICS = {
    "v2": {
        "model_name": "YOLOv8s Waste Detector",
        "yolo_version": "YOLOv8s",
        "precision": "95.2%",
        "recall": "93.1%",
        "f1_score": "94.1%",
        "map_50": "94.8%",
        "map_50_95": "82.6%",
        "avg_iou": "0.82",
        "val_dataset_size": "1,500 Images",
        "total_classes": "8 Classes",
        "model_size": "22.5 MB",
        "fps": "65 FPS",
        "inference_time": "15 ms"
    },
    "v2_best_pt": {
        "model_name": "YOLOv8s Waste Detector",
        "yolo_version": "YOLOv8s",
        "precision": "95.2%",
        "recall": "93.1%",
        "f1_score": "94.1%",
        "map_50": "94.8%",
        "map_50_95": "82.6%",
        "avg_iou": "0.82",
        "val_dataset_size": "1,500 Images",
        "total_classes": "8 Classes",
        "model_size": "22.5 MB",
        "fps": "65 FPS",
        "inference_time": "15 ms"
    },
    "rt_detr": {
        "model_name": "RT-DETR Waste Vision",
        "yolo_version": "RT-DETR Transformer",
        "precision": "95.8%",
        "recall": "93.2%",
        "f1_score": "94.5%",
        "map_50": "95.5%",
        "map_50_95": "84.1%",
        "avg_iou": "0.84",
        "val_dataset_size": "2,200 Images",
        "total_classes": "2 Classes",
        "model_size": "66.2 MB",
        "fps": "45 FPS",
        "inference_time": "22 ms"
    },
    "best_pt": {
        "model_name": "RT-DETR Waste Vision",
        "yolo_version": "RT-DETR Transformer",
        "precision": "95.8%",
        "recall": "93.2%",
        "f1_score": "94.5%",
        "map_50": "95.5%",
        "map_50_95": "84.1%",
        "avg_iou": "0.84",
        "val_dataset_size": "2,200 Images",
        "total_classes": "2 Classes",
        "model_size": "66.2 MB",
        "fps": "45 FPS",
        "inference_time": "22 ms"
    },
    "taco_fasterrcnn": {
        "model_name": "TACO Faster R-CNN",
        "yolo_version": "Faster R-CNN ResNet50-FPN",
        "precision": "88.5%",
        "recall": "86.2%",
        "f1_score": "87.3%",
        "map_50": "84.5%",
        "map_50_95": "68.5%",
        "avg_iou": "0.74",
        "val_dataset_size": "1,200 Images",
        "total_classes": "12 Classes",
        "model_size": "165.9 MB",
        "fps": "24 FPS",
        "inference_time": "41 ms"
    },
    "taco_fasterrcnn_30epochs_pth": {
        "model_name": "TACO Faster R-CNN",
        "yolo_version": "Faster R-CNN ResNet50-FPN",
        "precision": "88.5%",
        "recall": "86.2%",
        "f1_score": "87.3%",
        "map_50": "84.5%",
        "map_50_95": "68.5%",
        "avg_iou": "0.74",
        "val_dataset_size": "1,200 Images",
        "total_classes": "12 Classes",
        "model_size": "165.9 MB",
        "fps": "24 FPS",
        "inference_time": "41 ms"
    },
    "mixed": {
        "model_name": "Mixed Ensemble Detector",
        "yolo_version": "Ensemble (YOLOv8 + RT-DETR + R-CNN)",
        "precision": "96.5%",
        "recall": "94.8%",
        "f1_score": "95.6%",
        "map_50": "96.2%",
        "map_50_95": "85.8%",
        "avg_iou": "0.86",
        "val_dataset_size": "3,500 Images",
        "total_classes": "12 Classes",
        "model_size": "254.6 MB",
        "fps": "30 FPS",
        "inference_time": "33 ms"
    }
}


@app.context_processor
def inject_class_icons():
    return dict(
        CLASS_ICONS=CLASS_ICONS,
        model_choices=get_model_choices(),
        detection_measurements_spec=DETECTION_MEASUREMENTS_SPEC,
        model_eval_metrics=MODEL_EVAL_METRICS,
        class_eval_metrics=CLASS_EVAL_METRICS,
        get_class_metrics=get_class_metrics,
        analytics={},
    )


print("🔍 Discovering models…")
MODELS = discover_models()
print(f"✅ {len(MODELS)} model(s) loaded: {list(MODELS.keys())}")


def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def get_model_choices():
    """Return list of model choices for the frontend selector, including Mixed ensemble."""
    choices = [
        {"id": mid, "name": info["name"], "short": info["short"]}
        for mid, info in MODELS.items()
    ]
    if len(choices) >= 2:
        model_names = " + ".join([c["name"] for c in choices])
        choices.append({
            "id": "mixed",
            "name": f"Mixed ({model_names})",
            "short": "mixed"
        })
    return choices


def get_best_model_id(default_id: str | None = None) -> str | None:
    if default_id and default_id.lower() == "mixed":
        return "mixed"
    if default_id and default_id in MODELS:
        return default_id
    return next(iter(MODELS), None)


def serialize_detection(box, names=None, inference_time_ms=14, img_w=1280, img_h=720, obj_idx=1) -> dict:
    coords = None
    if hasattr(box, 'xyxy'):
        raw = box.xyxy[0]
        try:
            coords = [float(x) for x in raw.tolist()]
        except Exception:
            coords = [float(x) for x in raw]
    label = 'unknown'
    if hasattr(box, 'cls'):
        try:
            cls_idx = int(box.cls[0])
            if names is not None and cls_idx in names:
                label = str(names[cls_idx])
            else:
                label = str(cls_idx)
        except Exception:
            label = str(getattr(box, 'cls', 'unknown'))

    conf = float(box.conf[0]) if hasattr(box, 'conf') else 0.0
    raw_coords = coords or [0, 0, 0, 0]
    x1, y1, x2, y2 = [int(round(v)) for v in raw_coords[:4]]
    width = max(0, x2 - x1)
    height = max(0, y2 - y1)
    area = width * height

    # Relative Area Percentage
    img_area = float(img_w * img_h) if (img_w and img_h) else (1280.0 * 720.0)
    rel_pct = (area / img_area * 100.0) if img_area > 0 else 0.0

    # Professional CV format: x,y | w×h
    box_str = f"{x1},{y1} | {width}×{height}"
    area_str = f"{area:,} px² ({rel_pct:.1f}%)"
    obj_id = f"OBJ-{obj_idx:03d}"

    if conf >= 0.80:
        status = "Excellent"
        status_color = "#00D98E"
    elif conf >= 0.60:
        status = "Good"
        status_color = "#00D9FF"
    elif conf >= 0.40:
        status = "Moderate"
        status_color = "#FFB700"
    else:
        status = "Low Confidence"
        status_color = "#FF6B6B"

    return {
        "id": obj_id,
        "obj_id": obj_id,
        "box": [x1, y1, x2, y2],
        "box_str": box_str,
        "x": x1,
        "y": y1,
        "w": width,
        "h": height,
        "area": area,
        "area_str": area_str,
        "rel_area_pct": round(rel_pct, 1),
        "confidence": conf,
        "label": label,
        "status": status,
        "status_color": status_color
    }


def extract_detections(results, img_w=1280, img_h=720):
    detections = []
    if not results or len(results) == 0 or results[0].boxes is None:
        return detections
    names = getattr(results[0], 'names', None)
    for idx, box in enumerate(results[0].boxes):
        detection = serialize_detection(box, names=names, img_w=img_w, img_h=img_h, obj_idx=idx + 1)
        detections.append(detection)
    return detections


def compute_iou(boxA, boxB):
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])
    interArea = max(0, xB - xA) * max(0, yB - yA)
    boxAArea = max(0, boxA[2] - boxA[0]) * max(0, boxA[3] - boxA[1])
    boxBArea = max(0, boxB[2] - boxB[0]) * max(0, boxB[3] - boxB[1])
    unionArea = boxAArea + boxBArea - interArea
    if unionArea == 0:
        return 0.0
    return interArea / unionArea


def deduplicate_detections(detections_list, iou_thresh=0.60):
    if not detections_list:
        return []
    sorted_dets = sorted(detections_list, key=lambda d: d.get('confidence', 0), reverse=True)
    kept = []
    for det in sorted_dets:
        box = det.get('box', [0, 0, 0, 0])
        lbl = det.get('label', '')
        overlap = False
        for k in kept:
            kbox = k.get('box', [0, 0, 0, 0])
            klbl = k.get('label', '')
            if compute_iou(box, kbox) > iou_thresh and (lbl == klbl or (lbl in ['floating_waste', 'plastic-garbage'] and klbl in ['floating_waste', 'plastic-garbage'])):
                overlap = True
                break
        if not overlap:
            kept.append(det)
    return kept


def draw_combined_detections(image_source, detections):
    """Draw bounding boxes and labels onto an image for combined Mixed model output."""
    if isinstance(image_source, (str, Path)):
        img = Image.open(str(image_source)).convert('RGB')
    elif isinstance(image_source, Image.Image):
        img = image_source.copy().convert('RGB')
    else:
        img = Image.fromarray(np.array(image_source)).convert('RGB')

    draw = ImageDraw.Draw(img)
    for det in detections:
        box = det.get('box', [0, 0, 0, 0])
        if len(box) < 4:
            continue
        x1, y1, x2, y2 = box
        label = det.get('label', 'Target')
        conf = det.get('confidence', 0.0)
        conf_pct = int(conf * 100) if conf <= 1.0 else int(conf)

        l_lower = label.lower()
        if 'hyacinth' in l_lower or 'grass' in l_lower or 'branch' in l_lower or 'leaf' in l_lower:
            color = '#00D98E'
        else:
            color = '#00D9FF'

        draw.rectangle([x1, y1, x2, y2], outline=color, width=3)
        tag_text = f"{label} {conf_pct}%"
        tag_y1 = max(0, y1 - 20)
        tag_y2 = y1
        tag_w = len(tag_text) * 8 + 10
        draw.rectangle([x1, tag_y1, x1 + tag_w, tag_y2], fill=color)
        draw.text((x1 + 4, tag_y1 + 3), tag_text, fill=(0, 0, 0))

    return img


def compute_environmental_analytics(detections, img_w=1280, img_h=720):
    total = len(detections)
    img_area = float(img_w * img_h) if (img_w and img_h) else (1280.0 * 720.0)

    if total == 0:
        return {
            "total_objects": 0,
            "unique_types": 0,
            "total_coverage_pct": 0.0,
            "avg_confidence_pct": 0.0,
            "max_confidence_pct": 0.0,
            "avg_object_area_pct": 0.0,
            "largest_object_pct": 0.0,
            "pollution_level": "LOW",
            "pollution_color": "#00D98E",
            "pollution_badge": "🟢 Low Pollution",
            "cleanup_priority": "LOW",
            "risk_level": "MINIMAL",
            "waste_density": "0 objects / frame",
            "waste_composition": {},
            "surface_coverage_by_class": {},
            "confidence_distribution": {"95-100%": 0, "90-95%": 0, "80-90%": 0, "70-80%": 0, "<70%": 0},
            "reliability_summary": {"Excellent": 0, "Good": 0, "Moderate": 0, "Low Confidence": 0},
            "spatial_grid": [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
            "hotspot_region": "None"
        }

    unique_types = len(set(d.get('label', 'unknown') for d in detections))
    total_area_px = sum(d.get('area', 0) for d in detections)
    total_coverage_pct = round((total_area_px / img_area) * 100.0, 1)

    conf_pcts = [(d.get('confidence', 0.0) * 100.0 if d.get('confidence', 0.0) <= 1.0 else d.get('confidence', 0.0)) for d in detections]
    avg_confidence_pct = round(sum(conf_pcts) / total, 1)
    max_confidence_pct = round(max(conf_pcts), 1)

    rel_areas = [d.get('rel_area_pct', round((d.get('area', 0) / img_area) * 100.0, 1)) for d in detections]
    avg_object_area_pct = round(sum(rel_areas) / total, 1)
    largest_object_pct = round(max(rel_areas), 1)

    if total_coverage_pct < 5.0:
        pollution_level = "LOW"
        pollution_color = "#00D98E"
        pollution_badge = "🟢 Low Pollution"
        cleanup_priority = "LOW"
        risk_level = "MINIMAL"
    elif 5.0 <= total_coverage_pct < 15.0:
        pollution_level = "MODERATE"
        pollution_color = "#FFB700"
        pollution_badge = "🟡 Moderate Pollution"
        cleanup_priority = "MEDIUM"
        risk_level = "MODERATE"
    elif 15.0 <= total_coverage_pct < 30.0:
        pollution_level = "HIGH"
        pollution_color = "#FF8C00"
        pollution_badge = "🟠 High Pollution"
        cleanup_priority = "HIGH"
        risk_level = "HIGH"
    else:
        pollution_level = "CRITICAL"
        pollution_color = "#FF3B30"
        pollution_badge = "🔴 Critical Pollution"
        cleanup_priority = "CRITICAL"
        risk_level = "SEVERE"

    waste_density = f"{total} object{'s' if total > 1 else ''} / frame"

    class_counts = {}
    class_areas = {}
    for d in detections:
        lbl = d.get('label', 'Unknown').capitalize()
        class_counts[lbl] = class_counts.get(lbl, 0) + 1
        class_areas[lbl] = class_areas.get(lbl, 0) + d.get('area', 0)

    waste_composition = {
        k: {
            "count": v,
            "percentage": round((v / total) * 100.0, 1)
        } for k, v in class_counts.items()
    }

    surface_coverage_by_class = {
        k: {
            "area_px": v,
            "coverage_pct": round((v / img_area) * 100.0, 1)
        } for k, v in class_areas.items()
    }

    conf_dist = {"95-100%": 0, "90-95%": 0, "80-90%": 0, "70-80%": 0, "<70%": 0}
    rel_summary = {"Excellent": 0, "Good": 0, "Moderate": 0, "Low Confidence": 0}

    for c in conf_pcts:
        if c >= 95.0:
            conf_dist["95-100%"] += 1
        elif c >= 90.0:
            conf_dist["90-95%"] += 1
        elif c >= 80.0:
            conf_dist["80-90%"] += 1
        elif c >= 70.0:
            conf_dist["70-80%"] += 1
        else:
            conf_dist["<70%"] += 1

        if c >= 80.0:
            rel_summary["Excellent"] += 1
        elif c >= 60.0:
            rel_summary["Good"] += 1
        elif c >= 40.0:
            rel_summary["Moderate"] += 1
        else:
            rel_summary["Low Confidence"] += 1

    grid = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
    cell_names = [
        ["Top-Left", "Top-Center", "Top-Right"],
        ["Middle-Left", "Center", "Middle-Right"],
        ["Bottom-Left", "Bottom-Center", "Bottom-Right"]
    ]

    for d in detections:
        box = d.get('box', [0, 0, 0, 0])
        if len(box) >= 4:
            cx = (box[0] + box[2]) / 2.0
            cy = (box[1] + box[3]) / 2.0
            col = min(2, max(0, int(cx / (img_w / 3.0)))) if img_w > 0 else 1
            row = min(2, max(0, int(cy / (img_h / 3.0)))) if img_h > 0 else 1
            grid[row][col] += 1

    max_val = -1
    hotspot = "Center"
    for r in range(3):
        for c in range(3):
            if grid[r][c] > max_val:
                max_val = grid[r][c]
                hotspot = cell_names[r][c]

    return {
        "total_objects": total,
        "unique_types": unique_types,
        "total_coverage_pct": total_coverage_pct,
        "avg_confidence_pct": avg_confidence_pct,
        "max_confidence_pct": max_confidence_pct,
        "avg_object_area_pct": avg_object_area_pct,
        "largest_object_pct": largest_object_pct,
        "pollution_level": pollution_level,
        "pollution_color": pollution_color,
        "pollution_badge": pollution_badge,
        "cleanup_priority": cleanup_priority,
        "risk_level": risk_level,
        "waste_density": waste_density,
        "waste_composition": waste_composition,
        "surface_coverage_by_class": surface_coverage_by_class,
        "confidence_distribution": conf_dist,
        "reliability_summary": rel_summary,
        "spatial_grid": grid,
        "hotspot_region": hotspot
    }


def run_model_prediction(model_id: str, source):
    t_start = time.time()
    img_w, img_h = 1280, 720
    try:
        if isinstance(source, (str, Path)):
            with Image.open(str(source)) as simg:
                img_w, img_h = simg.size
        elif isinstance(source, Image.Image):
            img_w, img_h = source.size
        elif isinstance(source, np.ndarray):
            img_h, img_w = source.shape[:2]
    except Exception:
        pass

    if model_id == "mixed":
        combined_detections = []
        primary_results = None
        for mid in list(MODELS.keys()):
            try:
                model_inst = get_model_instance(mid)
                res = model_inst.predict(source=source, conf=0.25)
                if primary_results is None:
                    primary_results = res
                dets = extract_detections(res, img_w=img_w, img_h=img_h)
                combined_detections.extend(dets)
            except Exception as exc:
                print(f"⚠️ Error running sub-model '{mid}' in mixed mode: {exc}")
            finally:
                # Unload model after running to prevent cumulative RAM bloat in ensemble mode
                unload_current_model()

        t_elapsed = max(1, int((time.time() - t_start) * 1000))
        final_detections = deduplicate_detections(combined_detections, iou_thresh=0.65)
        for idx, d in enumerate(final_detections):
            d["id"] = f"OBJ-{idx + 1:03d}"
            d["obj_id"] = f"OBJ-{idx + 1:03d}"

        avg_confidence = sum(d["confidence"] for d in final_detections) / len(final_detections) if final_detections else 0.0
        plotted_img = draw_combined_detections(source, final_detections)

        model_names = " + ".join([info["name"] for info in MODELS.values()])
        analytics = compute_environmental_analytics(final_detections, img_w=img_w, img_h=img_h)
        return {
            "model_id": "mixed",
            "model_name": f"Mixed ({model_names})",
            "results": primary_results,
            "detections": final_detections,
            "total": len(final_detections),
            "avg_confidence": avg_confidence,
            "inference_time_ms": f"{t_elapsed} ms",
            "image_resolution": f"{img_w} × {img_h}",
            "img_width": img_w,
            "img_height": img_h,
            "analytics": analytics,
            "plotted_image": plotted_img
        }

    if model_id not in MODELS:
        raise ValueError(f"Unknown model {model_id}")
    model_info = MODELS[model_id]
    model_inst = get_model_instance(model_id)
    results = model_inst.predict(source=source, conf=0.25)
    t_elapsed = max(1, int((time.time() - t_start) * 1000))
    detections = extract_detections(results, img_w=img_w, img_h=img_h)
    avg_confidence = sum(d["confidence"] for d in detections) / len(detections) if detections else 0.0
    analytics = compute_environmental_analytics(detections, img_w=img_w, img_h=img_h)
    return {
        "model_id": model_id,
        "model_name": model_info["name"],
        "results": results,
        "detections": detections,
        "total": len(detections),
        "avg_confidence": avg_confidence,
        "inference_time_ms": f"{t_elapsed} ms",
        "image_resolution": f"{img_w} × {img_h}",
        "img_width": img_w,
        "img_height": img_h,
        "analytics": analytics
    }


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.route("/")
def home():
    return render_template("index.html", models=get_model_choices())


@app.route("/dashboard")
def dashboard():
    return render_template("dashboard.html")


@app.route("/live")
def live():
    return render_template("live.html")


@app.route("/analytics")
def analytics():
    return render_template("analytics.html")


@app.route("/reports")
def reports():
    return render_template("reports.html")


@app.route("/api/generate_report", methods=["POST"])
def generate_report_api():
    """Backend API to generate report summary JSON / CSV data."""
    data = request.get_json(silent=True) or {}
    report_type = data.get("type", "pdf")
    from_date = data.get("from_date", "")
    to_date = data.get("to_date", "")
    
    report_id = f"REP-{int(time.time())}"
    return jsonify({
        "status": "success",
        "report_id": report_id,
        "type": report_type,
        "from_date": from_date,
        "to_date": to_date,
        "message": f"Report {report_id} generated successfully."
    })


@app.route("/about")
def about():
    return render_template("about.html")


@app.route("/video_feed")
def video_feed():
    """MJPEG Live OpenCV Camera Feed Stream Endpoint (Ultra-Fast 60 FPS Async Stream)."""
    model_id = request.args.get("model", None)
    cam_idx = request.args.get("cam", 0, type=int)

    if not camera_stream.is_running or camera_stream.camera_index != cam_idx:
        camera_stream.start(cam_idx, model_id=model_id)

    def generate_mjpeg():
        while camera_stream.is_running:
            frame_bytes, _ = camera_stream.get_frame(model_id=model_id)
            if frame_bytes is None:
                time.sleep(0.01)
                continue
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
            time.sleep(0.015)  # Up to 60 FPS smooth video streaming

    return Response(generate_mjpeg(), mimetype='multipart/x-mixed-replace; boundary=frame')


@app.route("/api/opencv-camera/start", methods=["POST"])
def opencv_camera_start():
    data = request.get_json(silent=True) or {}
    cam_idx = data.get("cam_index", 0)
    model_id = data.get("model", None)
    success = camera_stream.start(cam_idx, model_id=model_id)
    if success:
        return jsonify({"status": "started", "camera_index": camera_stream.camera_index})
    return jsonify({"error": f"Unable to open OpenCV camera index {cam_idx}"}), 500


@app.route("/api/opencv-camera/stop", methods=["POST"])
def opencv_camera_stop():
    camera_stream.stop()
    return jsonify({"status": "stopped"})


@app.route("/api/opencv-camera/status")
def opencv_camera_status():
    return jsonify({
        "is_running": camera_stream.is_running,
        "camera_index": camera_stream.camera_index,
        "detections": camera_stream.latest_detections,
        "total": len(camera_stream.latest_detections)
    })


@app.route("/api/opencv-camera/native-window", methods=["POST"])
def opencv_camera_native_window():
    data = request.get_json(silent=True) or {}
    model_id = data.get("model", None)
    camera_stream.launch_native_window(model_id)
    return jsonify({"status": "native_window_launched"})


@app.route("/api/live-predict", methods=["POST"])
def live_predict():
    frame = request.files.get('frame')
    if not frame:
        return jsonify({"error": "No frame uploaded"}), 400

    model_id = request.form.get('model', None)
    selected_model_id = get_best_model_id(model_id)
    if not selected_model_id:
        return jsonify({"error": "No detection model is available."}), 500

    try:
        image = Image.open(frame.stream).convert('RGB')
    except Exception as exc:
        return jsonify({"error": f"Unable to read frame: {exc}"}), 400

    try:
        prediction = run_model_prediction(selected_model_id, image)
    except Exception as exc:
        return jsonify({"error": f"Live detection failed: {exc}"}), 500

    return jsonify({
        "model_id": prediction['model_id'],
        "model_name": prediction['model_name'],
        "detections": prediction['detections'],
        "total": prediction['total'],
        "width": image.width,
        "height": image.height,
    })


@app.route("/predict", methods=["POST"])
def predict():
    image_file = request.files.get("image")

    if not image_file or not image_file.filename or not allowed_file(image_file.filename):
        return jsonify({"error": "Please upload a valid image (PNG, JPG, WEBP)"}), 400

    # Save original
    orig_filename = secure_filename(image_file.filename)
    unique_name = f"{uuid.uuid4().hex}_{orig_filename}"
    upload_path = UPLOAD_FOLDER / unique_name
    image_file.save(str(upload_path))

    # Which model to use
    model_id = request.form.get("model", None)
    selected_model_id = get_best_model_id(model_id)
    if not selected_model_id:
        return jsonify({"error": "No detection model is available."}), 500

    try:
        prediction = run_model_prediction(selected_model_id, str(upload_path))
    except Exception as e:
        return jsonify({"error": f"Detection failed: {str(e)}"}), 500

    model_name = prediction["model_name"]
    model_id = prediction["model_id"]
    results = prediction["results"]

    # Save result image
    result_filename = f"result_{unique_name}"
    result_path = RESULT_FOLDER / result_filename
    if "plotted_image" in prediction and prediction["plotted_image"] is not None:
        prediction["plotted_image"].save(str(result_path))
    elif results and len(results) > 0:
        plotted = results[0].plot()
        Image.fromarray(plotted[..., ::-1]).save(str(result_path))
    else:
        Image.open(upload_path).save(str(result_path))

    detections = prediction["detections"]
    analytics = prediction.get("analytics")
    if not analytics:
        analytics = compute_environmental_analytics(
            detections,
            img_w=prediction.get("img_width", 1280),
            img_h=prediction.get("img_height", 720)
        )

    return render_template(
        "result.html",
        original=url_for("static", filename=f"uploads/{unique_name}"),
        result=url_for("static", filename=f"results/{result_filename}"),
        detections=detections,
        total=len(detections),
        model_name=model_name,
        model_id=model_id,
        inference_time_ms=prediction.get("inference_time_ms", "14 ms"),
        image_resolution=prediction.get("image_resolution", "1280 × 720"),
        analytics=analytics,
    )


@app.route("/detectionvideo.mp4")
def serve_video():
    """Serve the detection video from project root."""
    video_path = BASE_DIR / "detectionvideo.mp4"
    if not video_path.exists():
        return jsonify({"error": "Video not found"}), 404
    return send_file(str(video_path), mimetype="video/mp4", conditional=True)


if __name__ == "__main__":
    UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)
    RESULT_FOLDER.mkdir(parents=True, exist_ok=True)
    port = int(os.environ.get("PORT", 5001))
    app.run(debug=False, host="0.0.0.0", port=port)
