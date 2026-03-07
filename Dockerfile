# syntax=docker/dockerfile:1
FROM python:3.10-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy and install requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app /app

# Set explicit working directory for gunicorn
WORKDIR /app/app

# Run gunicorn with correct parameters
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--worker-class", "gevent", "app:application"]
