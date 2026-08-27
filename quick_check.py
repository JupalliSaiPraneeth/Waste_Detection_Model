from ultralytics import YOLO
import glob

for pt_file in glob.glob('model/**/*.pt', recursive=True):
    print("Found model:", pt_file)
    try:
        m = YOLO(pt_file)
        print("  Classes:", m.names)
    except Exception as e:
        print("  Error loading:", e)
