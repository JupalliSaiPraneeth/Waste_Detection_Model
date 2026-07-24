import cv2
import numpy as np
from ultralytics import YOLO

model = YOLO('c:/WastageDetection/model/best.pt')
cap = cv2.VideoCapture('c:/WastageDetection/detectionvideo.mp4')
ret, frame = cap.read()
results = model.predict(source=frame, conf=0.25)
cap.release()

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
        except Exception as e:
            print(f"Error in label logic: {e}")
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
    print("Names type:", type(names), names)
    for box in results[0].boxes:
        detection = serialize_detection(box, names=names)
        detections.append(detection)
    return detections

dets = extract_detections(results)
print("Extracted:", len(dets))
print(dets[0] if dets else "No dets")
