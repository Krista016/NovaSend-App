# =============================================================================
# NovaSend - Railway Deployment Dockerfile
# =============================================================================
# Build:  docker build -t novasend .
# Run:    docker run -p 5000:5000 --env-file .env novasend
#
# Railway auto-detects this Dockerfile and sets PORT from its own env.
# =============================================================================

FROM python:3.11-slim

WORKDIR /app

# ---------------------------------------------------------------------------
# 1. Install Node.js 20.x (required for React / Vite frontend build)
# ---------------------------------------------------------------------------
RUN apt-get update \
    && apt-get install -y curl gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# ---------------------------------------------------------------------------
# 2. Install Python dependencies
#    Layer is cached unless requirements.txt changes.
# ---------------------------------------------------------------------------
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ---------------------------------------------------------------------------
# 3. Install Google Chrome + Playwright system dependencies
#    playwright install-deps installs the shared libraries Chrome needs.
#    We install actual Google Chrome instead of Playwright's bundled Chromium.
# ---------------------------------------------------------------------------
RUN apt-get update \
    && apt-get install -y wget gnupg \
    && wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] https://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update \
    && apt-get install -y google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*
RUN playwright install-deps chromium \
    && rm -rf /var/lib/apt/lists/*

# ---------------------------------------------------------------------------
# 4. Install Node.js dependencies
#    Layer is cached unless package.json / package-lock.json changes.
# ---------------------------------------------------------------------------
COPY package.json package-lock.json ./
RUN npm ci

# ---------------------------------------------------------------------------
# 5. Copy application source code
# ---------------------------------------------------------------------------
COPY . .

# ---------------------------------------------------------------------------
# 6. Build React frontend (Vite → dist/)
# ---------------------------------------------------------------------------
RUN npm run build

# ---------------------------------------------------------------------------
# 7. Create runtime directories
# ---------------------------------------------------------------------------
RUN mkdir -p uploads qr_codes

# ---------------------------------------------------------------------------
# 8. Runtime environment variables
#    PORT is read by run.py; Railway injects its own $PORT at runtime.
#    HEADLESS=true ensures Playwright runs the browser in headless mode.
# ---------------------------------------------------------------------------
ENV PORT=5000
ENV HOST=0.0.0.0
ENV HEADLESS=true
ENV PYTHONUNBUFFERED=1

EXPOSE 5000

CMD ["python", "run.py"]