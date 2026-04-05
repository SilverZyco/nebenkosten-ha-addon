# ============================================================
# Stage 1: Frontend bauen
# ============================================================
FROM node:20-alpine AS frontend-builder

WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci

COPY frontend/ .

# Leere API URL → relative Pfade → nginx übernimmt Routing
ENV NEXT_PUBLIC_API_URL=""
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ============================================================
# Stage 2: Finales Image (Debian + Python + Node + PostgreSQL)
# ============================================================
FROM python:3.12-slim

# System-Pakete: Node.js 20, PostgreSQL 16, nginx, supervisor, OCR
RUN apt-get update && apt-get install -y curl gnupg2 lsb-release ca-certificates && \
    # Node.js 20
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    # PostgreSQL 16
    curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
        | gpg --dearmor -o /etc/apt/trusted.gpg.d/postgresql.gpg && \
    echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
        > /etc/apt/sources.list.d/pgdg.list && \
    apt-get update && apt-get install -y \
        nodejs \
        postgresql-16 \
        nginx \
        supervisor \
        jq \
        openssl \
        tesseract-ocr \
        tesseract-ocr-deu \
        tesseract-ocr-eng \
        poppler-utils \
        locales \
    && locale-gen de_DE.UTF-8 \
    && rm -rf /var/lib/apt/lists/*

# Python-Abhängigkeiten
WORKDIR /app/backend
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Backend-Code
COPY backend/ .

# Frontend Build (standalone)
COPY --from=frontend-builder /frontend/.next/standalone/ /app/frontend/
COPY --from=frontend-builder /frontend/.next/static/ /app/frontend/.next/static/
COPY --from=frontend-builder /frontend/public/ /app/frontend/public/

# Statische Dateien
COPY dokumente/ /app/dokumente/
COPY logo/ /app/logo/

# Addon-Konfiguration
COPY ha-addon/nebenkosten/nginx.conf /etc/nginx/sites-available/default
COPY ha-addon/nebenkosten/supervisord.conf /etc/supervisor/conf.d/nebenkosten.conf
COPY ha-addon/nebenkosten/run.sh /run.sh
RUN chmod +x /run.sh

# Nginx default config entfernen
RUN rm -f /etc/nginx/sites-enabled/default && \
    ln -s /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default

# Verzeichnisse anlegen
RUN mkdir -p /data/uploads /data/postgres /var/log/supervisor

EXPOSE 8099

CMD ["/run.sh"]
