import cv2
import numpy as np
from ultralytics import YOLO

model = YOLO('c:/WastageDetection/model/best.pt')
# Create a dummy image
img = np.zeros((480, 640, 3), dtype=np.uint8)
results = model.predict(source=img, conf=0.25)
print("Detections dummy:", len(results[0].boxes))

# What if we run on the video frame?
cap = cv2.VideoCapture('c:/WastageDetection/detectionvideo.mp4')
ret, frame = cap.read()
if ret:
    results = model.predict(source=frame, conf=0.25)
    print("Detections frame:", len(results[0].boxes))
    print("Boxes:", results[0].boxes)
    print("Names:", results[0].names)
cap.release()
