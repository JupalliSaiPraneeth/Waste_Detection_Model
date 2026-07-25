FROM python:3.11-slim

# Install system dependencies for OpenCV and image processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements and install CPU-optimized PyTorch & dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu torch torchvision
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY . .

# Ensure upload and result directories exist
RUN mkdir -p static/uploads static/results

EXPOSE 7860

ENV PORT=7860
ENV PYTHONUNBUFFERED=1
ENV OMP_NUM_THREADS=1
ENV MKL_NUM_THREADS=1

CMD ["gunicorn", "--bind", "0.0.0.0:7860", "--workers", "1", "--threads", "2", "--timeout", "120", "app:app"]

