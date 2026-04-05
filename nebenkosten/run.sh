#!/bin/bash
set -e

OPTIONS="/data/options.json"

# Optionen aus HA lesen
POSTGRES_PASSWORD=$(jq -r '.postgres_password // "changeme"' "$OPTIONS")
SECRET_KEY=$(jq -r '.secret_key // ""' "$OPTIONS")
OPENAI_API_KEY=$(jq -r '.openai_api_key // ""' "$OPTIONS")
OPENAI_MODEL=$(jq -r '.openai_model // "gpt-4o"' "$OPTIONS")
OCR_ENABLED=$(jq -r '.ocr_enabled // "true"' "$OPTIONS")
AI_ENABLED=$(jq -r '.ai_enabled // "true"' "$OPTIONS")

# Secret Key auto-generieren falls leer oder "auto"
if [ -z "$SECRET_KEY" ] || [ "$SECRET_KEY" = "auto" ]; then
    SECRET_KEY_FILE="/data/secret_key"
    if [ ! -f "$SECRET_KEY_FILE" ]; then
        openssl rand -hex 32 > "$SECRET_KEY_FILE"
    fi
    SECRET_KEY=$(cat "$SECRET_KEY_FILE")
fi

# Umgebungsvariablen in Datei schreiben (für supervisord Programme)
cat > /etc/nebenkosten.env << EOF
export POSTGRES_USER=nebenkosten
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD}"
export POSTGRES_DB=nebenkosten
export DATABASE_URL="postgresql+asyncpg://nebenkosten:${POSTGRES_PASSWORD}@localhost:5432/nebenkosten"
export DATABASE_URL_SYNC="postgresql://nebenkosten:${POSTGRES_PASSWORD}@localhost:5432/nebenkosten"
export SECRET_KEY="${SECRET_KEY}"
export ALGORITHM=HS256
export ACCESS_TOKEN_EXPIRE_MINUTES=60
export REFRESH_TOKEN_EXPIRE_DAYS=30
export UPLOAD_DIR=/data/uploads
export MAX_UPLOAD_SIZE_MB=50
[ "$OPENAI_API_KEY" = "none" ] && OPENAI_API_KEY=""
export OPENAI_API_KEY="${OPENAI_API_KEY}"
export OPENAI_MODEL="${OPENAI_MODEL}"
export OCR_ENABLED="${OCR_ENABLED}"
export AI_ENABLED="${AI_ENABLED}"
export CORS_ORIGINS="*"
export DOCUMENTS_DIR=/app/dokumente
export LOGO_PATH=/app/logo/logo.png
export NEXT_PUBLIC_API_URL=""
EOF

# Verzeichnisse vorbereiten
mkdir -p /data/uploads /data/postgres /var/log/supervisor /var/run/postgresql
chown postgres:postgres /var/run/postgresql
chown -R postgres:postgres /data/postgres

# PostgreSQL initialisieren (nur beim ersten Start)
if [ ! -f "/data/postgres/PG_VERSION" ]; then
    echo ">>> Initialisiere PostgreSQL Datenbank..."
    su postgres -c "/usr/lib/postgresql/16/bin/initdb -D /data/postgres --encoding=UTF8 --locale=de_DE.UTF-8 || /usr/lib/postgresql/16/bin/initdb -D /data/postgres --encoding=UTF8"
fi

# PostgreSQL kurz starten um DB + User anzulegen
echo ">>> Starte PostgreSQL für Setup..."
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /data/postgres -o '-c listen_addresses=localhost -c unix_socket_directories=/var/run/postgresql' start -w"

# Datenbank und User anlegen falls noch nicht vorhanden
su postgres -c "psql -c \"SELECT 1 FROM pg_roles WHERE rolname='nebenkosten'\" | grep -q 1 || psql -c \"CREATE USER nebenkosten WITH PASSWORD '${POSTGRES_PASSWORD}';\"" 2>/dev/null || true
su postgres -c "psql -c \"SELECT 1 FROM pg_database WHERE datname='nebenkosten'\" | grep -q 1 || psql -c \"CREATE DATABASE nebenkosten OWNER nebenkosten;\"" 2>/dev/null || true

# PostgreSQL wieder stoppen (supervisord übernimmt)
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /data/postgres stop -w"

echo ">>> Starte alle Dienste..."
exec /usr/bin/supervisord -c /etc/supervisor/supervisord.conf
