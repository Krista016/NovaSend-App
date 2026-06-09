# =============================================================================
# NovaSend - Lightweight GCP VM Deployment Dockerfile
# =============================================================================

FROM python:3.11-slim-bookworm

WORKDIR /app

# Install basic system utilities
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY . .

# Create runtime directories
RUN mkdir -p uploads

ENV PORT=5000
ENV HOST=0.0.0.0
ENV PYTHONUNBUFFERED=1

EXPOSE 5000

CMD ["python", "run.py"]
