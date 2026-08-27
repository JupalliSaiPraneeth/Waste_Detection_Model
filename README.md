# HydraClean: Real-Time Floating Waste Detection & Environmental Analytics Framework

[![Python](https://img.shields.io/badge/Python-3.10%2B-blue.svg)](https://www.python.org/)
[![PyTorch](https://img.shields.io/badge/PyTorch-2.0%2B-EE4C2C.svg)](https://pytorch.org/)
[![Flask](https://img.shields.io/badge/Flask-3.0%2B-000000.svg)](https://flask.palletsprojects.com/)
[![Ultralytics](https://img.shields.io/badge/RT--DETR-v8.0%2B-blueviolet.svg)](https://docs.ultralytics.com/models/rtdetr/)
[![Docker](https://img.shields.io/badge/Docker-Supported-2496ED.svg)](https://www.docker.com/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**HydraClean** is an enterprise-grade, intelligent vision transformer framework engineered for real-time automated detection and analytics of aquatic floating waste. Powered by **RT-DETR (Real-Time Detection Transformer)** and augmented with an adaptive **Water Surface Glare & Texture Filtering Engine**, HydraClean identifies macro-plastics, invasive aquatic flora, and floating debris across rivers, lakes, and municipal waterways.

The platform integrates a high-throughput **Flask web engine**, real-time video stream processor, spatial density heatmap generator, and automated academic report generator (.docx / .tex), delivering a production-ready solution for edge devices (ASVs/drones) and centralized monitoring stations.

---

## 🌟 Key Features

* **Transformer-Based Object Detection**: Leverages fine-tuned **RT-DETR** with HGNetv2 backbone, Intra-Scale Feature Interaction (AIFI), and Cross-Scale Feature Fusion (CCFM) for NMS-free high-precision detection.
* **Water Surface Aware Glare & Reflection Filter**: Includes a specialized CV engine (`water_surface_engine.py`) using HSV/Lab color space segmentation and dynamic texture gradient analysis to eliminate specular reflections, sun glare, wave ripples, and foam false positives.
* **Multi-Model Inference & Benchmarking**: Supports runtime model switching between **RT-DETR**, **YOLOv8s**, and **Faster R-CNN** for comparative research and edge performance optimization.
* **Real-Time Video Stream & Tracking**: Multi-frame object tracking (`FloatingWasteTracker`) with object ID persistence, confidence tiering (High/Medium/Low), and live webcam/file streaming endpoints.
* **Interactive Web Analytics Suite**: Web dashboard providing category frequency histograms, spatial hotspot distribution grids, confidence percentiles, and dynamic LocalStorage session tracking.
* **Automated Scientific Report Generation**: Single-click export of comprehensive environmental audit reports in Word (.docx) and LaTeX (.tex) formats.
* **Hard-Negative Training Pipeline**: Built-in dataset curation tool (`hard_negative_trainer.py`) for zero-annotation clean water and land background training to minimize false positives.
* **Production & Edge Ready**: Containerized with Docker, optimized single-thread CPU execution for low-memory servers (Render 512MB RAM), and Gunicorn WSGI integration.

---

## 🏗️ System Architecture

```
                                [ Input Video Stream / Camera / Image ]
                                                  │
                                                  ▼
                                [ Image Preprocessing & Normalization ]
                                                  │
                                                  ▼
                              [ Water Surface Engine (HSV / Lab / Canny) ]
                                 ├── Segment Water Body Surface Mask
                                 └── Filter Sun Glare, Wave Ripples & Specular Glare
                                                  │
                                                  ▼
                                   [ RT-DETR Vision Transformer ]
                                 ├── Backbone: HGNetv2 (Multi-Scale Features)
                                 ├── Encoder: AIFI (Intra-Scale Self-Attention)
                                 ├── Fusion: CCFM (Cross-Exec Scale Feature Fusion)
                                 └── Decoder: IoU-Aware Query Selection (NMS-Free)
                                                  │
                                                  ▼
                                [ Multi-Frame Object Tracker & Counter ]
                                                  │
                                                  ▼
                                  [ Flask Web Analytics Engine ]
                                 ├── Real-Time Streaming Endpoint (/video_feed)
                                 ├── Spatial Hotspot & Category Analytics
                                 └── Automated Academic Report Exporter (.docx / .tex)
```

---

## 📊 Model Performance Benchmarks

Evaluated across a curated dataset of **2,200 high-resolution water body images** (8,510 annotated object instances across 6 waste categories) on an NVIDIA RTX 4090 GPU:

| Architecture | mAP @ 0.5 | mAP @ 0.5:0.95 | Precision | Recall | F1-Score | Latency | FPS | Model Size |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **RT-DETR (HydraClean)** | **95.5%** | **84.1%** | **95.8%** | **93.2%** | **0.945** | **22.0 ms** | **45.5** | **66.2 MB** |
| YOLOv8s | 93.8% | 81.2% | 94.1% | 91.5% | 0.928 | 16.5 ms | 60.6 | 22.5 MB |
| Faster R-CNN (ResNet50) | 82.4% | 68.9% | 85.2% | 79.4% | 0.822 | 83.3 ms | 12.0 | 160.0 MB |
| EfficientDet-D2 | 88.5% | 74.3% | 89.1% | 86.0% | 0.875 | 35.7 ms | 28.0 | 32.0 MB |

---

## 🏷️ Dataset & Class Taxonomy

The system is trained to identify 6 environmental waste categories essential for aquatic eco-monitoring:

| Category Class | Target Instances | Key Identification Features |
| :--- | :---: | :--- |
| **Plastic Bottle** | 1,840 | PET drinking bottles, jugs, plastic containers |
| **Plastic Bag** | 1,620 | Submerged plastic films, grocery bags, synthetic wrappers |
| **Water Hyacinth** | 2,100 | Dense clusters of invasive aquatic vegetation |
| **Wood & Debris** | 1,120 | Floating timber logs, tree branches, organic debris |
| **Metal Can** | 850 | Beverage aluminum cans, discarded tin containers |
| **Other Waste** | 980 | Styrofoam chunks, rubber tires, discarded textile waste |
| **Total** | **8,510** | **Annotated Object Bounding Boxes** |

---

## 📁 Repository Structure

```
WastageDetection/
├── app.py                      # Core Flask Application & REST API Endpoints
├── water_surface_engine.py     # Water Surface Detector & False-Positive Filter Engine
├── hard_negative_trainer.py    # Hard-Negative Dataset Curation Pipeline
├── test_floating_engine.py     # Unit Tests for Engine & CV Algorithms
├── check_classes.py            # Dataset Class Verification Script
├── test_predict.py             # Model Predict Inference Script
├── Dockerfile                  # Container Deployment Configuration
├── Procfile                    # Cloud Deployment Startup File (Gunicorn)
├── requirements.txt            # Python Dependencies Specification
├── RT_DETR_Research_Paper.md   # Publication Research Paper (Markdown Edition)
├── RT_DETR_Research_Paper.tex  # Academic IEEE/Springer LaTeX Source File
├── model/                      # Trained Weights (.pt / .pth) & Model Cache
├── static/                     # Static Web Assets, CSS, JavaScript, Uploads & Results
└── templates/                  # Jinja2 HTML Templates (Analytics Dashboard)
```

---

## 🚀 Quick Start Guide

### Prerequisites
* Python 3.10+ installed
* OpenCL / CUDA support (Optional, PyTorch auto-falls back to CPU)

### 1. Installation
Clone the repository and set up a virtual environment:

```bash
git clone https://github.com/JupalliSaiPraneeth/Waste_Detection_Model.git
cd Waste_Detection_Model

# Create and activate virtual environment
python -m venv venv
# On Windows:
venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

# Install required packages
pip install -r requirements.txt
```

### 2. Run the Web Application
Launch the web server locally:

```bash
python app.py
```

Access the Web Analytics Dashboard at **`http://127.0.0.1:5000`** in your browser.

---

## 💻 Usage

### Image & Video Waste Detection
1. Open the web dashboard.
2. Select desired detection model (**RT-DETR**, **YOLOv8s**, or **Faster R-CNN**).
3. Adjust confidence threshold slider (Default: `0.25`).
4. Upload an image or video file to analyze detections, spatial heatmaps, and category breakdowns.

### Live Camera / Webcam Streaming
Connect an RTSP stream, USB camera, or video file for live tracking:
* Endpoint: `GET /video_feed?model=rtdetr&conf=0.25`

### Hard-Negative Dataset Curation
Generate zero-annotation negative label manifests for training background images:

```bash
python hard_negative_trainer.py
```

---

## 🐳 Docker Deployment

To build and run the application inside a container:

```bash
# Build Docker Image
docker build -t hydraclean-waste-detection .

# Run Container on Port 5000
docker run -p 5000:5000 hydraclean-waste-detection
```

---

## 📄 API Endpoints Reference

| Endpoint | Method | Description |
| :--- | :---: | :--- |
| `/` | `GET` | Main Web Analytics Dashboard UI |
| `/predict` | `POST` | Processes uploaded image/video and returns detection JSON + annotated image |
| `/video_feed` | `GET` | Real-time MJPEG video stream with target tracking overlay |
| `/download_report` | `POST` | Generates downloadable environmental audit report (.docx / .tex) |
| `/health` | `GET` | Health check endpoint for cloud monitoring |

---

## 📄 Academic Citation & Research Paper

If you use **HydraClean** or the **RT-DETR Aquatic Waste Framework** in your research, please cite our research paper:

```bibtex
@article{jupalli2026hydraclean,
  title={HydraClean: An Intelligent Real-Time Floating Waste Detection Framework Using RT-DETR with Web-Based Environmental Analytics},
  author={Jupalli, Sai Praneeth et al.},
  journal={Automated Wastage & Aquatic Eco-Monitoring Laboratory},
  year={2026},
  publisher={Environmental Vision AI Systems Research Group}
}
```

---

## 📜 License

Distributed under the **MIT License**. See `LICENSE` for details.
