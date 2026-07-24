from PIL import Image
import numpy as np
from ultralytics import YOLO

model = YOLO('c:/WastageDetection/model/best.pt')

# Assuming the user uploaded a frame from the video, let's load a frame with PIL
# I will first save a frame using cv2
import cv2
cap = cv2.VideoCapture('c:/WastageDetection/detectionvideo.mp4')
ret, frame = cap.read()
cap.release()
# Save as jpg
cv2.imwrite('c:/WastageDetection/temp_frame.jpg', frame)

# Now simulate app.py upload handling
image = Image.open('c:/WastageDetection/temp_frame.jpg').convert('RGB')
image_np = np.array(image)

results_np = model.predict(source=image_np, conf=0.25)
print("Detections with image_np (RGB numpy):", len(results_np[0].boxes))

results_pil = model.predict(source=image, conf=0.25)
print("Detections with PIL image:", len(results_pil[0].boxes))

# What about BGR numpy?
results_bgr = model.predict(source=frame, conf=0.25)
print("Detections with BGR frame:", len(results_bgr[0].boxes))

