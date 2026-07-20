import os
import re
import uuid
import json
import zipfile
from pathlib import Path
from io import BytesIO

from flask import Flask, render_template, request, jsonify, url_for, send_file
from werkzeug.utils import secure_filename
from ultralytics import YOLO
from PIL import Image
import numpy as np

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
# Utilities & model discovery
# ---------------------------------------------------------------------------
MODELS = {}  # model_id -> {"instance": YOLO, "name": str, "path": str}


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
            # Prefer files with 'detr' in the name if present
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


def discover_models():
    """Scan the model directory and load any .pt files (and .pt inside zips).
    Returns a dict of model_id -> info.
    """
    discovered = {}

    if not MODEL_DIR.exists():
        print(f"❌ Model folder missing: {MODEL_DIR}")
        return discovered

    paths = []
    paths.extend(MODEL_DIR.rglob('*.pt'))
    for zip_path in MODEL_DIR.rglob('*.zip'):
        extracted = extract_pt_from_zip(zip_path)
        if extracted:
            paths.append(extracted)

    seen = set()
    for path in sorted(set(paths)):
        if not path.exists():
            continue
        model_id = normalize_model_id(path)
        if model_id in seen:
            continue
        seen.add(model_id)
        friendly_name = 'YOLOv8'
        if 'detr' in str(path).lower() or 'rt-detr' in str(path).lower():
            friendly_name = 'RT-DETR'
        elif 'v2' in str(path.parent).lower() or 'v2' in str(path).lower():
            friendly_name = 'YOLOv8 v2'
        if path.name.lower() != 'best.pt':
            friendly_name = f"{friendly_name} ({path.name})"

        print(f"📦 Loading model '{model_id}' from {path}…")
        try:
            model = YOLO(str(path))
            discovered[model_id] = {
                "instance": model,
                "name": friendly_name,
                "short": model_id,
                "path": str(path),
            }
            print(f"   ✅ {model_id} loaded – classes: {model.names}")
        except Exception as exc:
            print(f"   ❌ Failed to load {path}: {exc}")

    if len(discovered) == 0:
        print("❌ No models found!")

    return discovered


# ---------------------------------------------------------------------------
# Class icon mapping
# ---------------------------------------------------------------------------
CLASS_ICONS = {
    "floating_waste": "🗑️",
    "water_hyacinth": "🌿",
    "bottle": "🍾",
    "grass": "🌱",
    "branch": "🪵",
    "milk-box": "🥛",
    "plastic-bag": "🛍️",
    "plastic-garbage": "♻️",
    "ball": "⚽",
    "leaf": "🍃",
}


@app.context_processor
def inject_class_icons():
    return dict(CLASS_ICONS=CLASS_ICONS, model_choices=get_model_choices())


print("🔍 Discovering models…")
MODELS = discover_models()
print(f"✅ {len(MODELS)} model(s) loaded: {list(MODELS.keys())}")


def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def get_model_choices():
    """Return list of model choices for the frontend selector."""
    return [
        {"id": mid, "name": info["name"], "short": info["short"]}
        for mid, info in MODELS.items()
    ]


def get_best_model_id(default_id: str | None = None) -> str | None:
    if default_id and default_id in MODELS:
        return default_id
    return next(iter(MODELS), None)


def serialize_detection(box, names=None) -> dict:
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
            if names is not None and cls_idx < len(names):
                label = str(names[cls_idx])
            else:
                label = str(cls_idx)
        except Exception:
            label = str(getattr(box, 'cls', 'unknown'))
    return {
        "box": coords or [0, 0, 0, 0],
        "confidence": float(box.conf[0]) if hasattr(box, 'conf') else 0.0,
        "label": label,
    }


def extract_detections(results):
    detections = []
    if not results or len(results) == 0 or results[0].boxes is None:
        return detections
    names = getattr(results[0], 'names', None)
    for box in results[0].boxes:
        detection = serialize_detection(box, names=names)
        detections.append(detection)
    return detections


def run_model_prediction(model_id: str, source):
    if model_id not in MODELS:
        raise ValueError(f"Unknown model {model_id}")
    model_info = MODELS[model_id]
    # ultralytics accepts numpy arrays, paths, or streams
    results = model_info["instance"].predict(source=source, conf=0.25)
    detections = extract_detections(results)
    avg_confidence = sum(d["confidence"] for d in detections) / len(detections) if detections else 0.0
    return {
        "model_id": model_id,
        "model_name": model_info["name"],
        "results": results,
        "detections": detections,
        "total": len(detections),
        "avg_confidence": avg_confidence,
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


@app.route("/about")
def about():
    return render_template("about.html")


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
        image_np = np.array(image)
    except Exception as exc:
        return jsonify({"error": f"Unable to read frame: {exc}"}), 400

    try:
        prediction = run_model_prediction(selected_model_id, image_np)
    except Exception as exc:
        return jsonify({"error": f"Live detection failed: {exc}"}), 500

    return jsonify({
        "model_id": prediction['model_id'],
        "model_name": prediction['model_name'],
        "detections": prediction['detections'],
        "total": prediction['total'],
        "width": image_np.shape[1],
        "height": image_np.shape[0],
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
    if results and len(results) > 0:
        plotted = results[0].plot()
        Image.fromarray(plotted[..., ::-1]).save(str(result_path))
    else:
        Image.open(upload_path).save(str(result_path))

    detections = prediction["detections"]

    return render_template(
        "result.html",
        original=url_for("static", filename=f"uploads/{unique_name}"),
        result=url_for("static", filename=f"results/{result_filename}"),
        detections=detections,
        total=len(detections),
        model_name=model_name,
        model_id=model_id,
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
    app.run(debug=True, host="0.0.0.0", port=5001)
