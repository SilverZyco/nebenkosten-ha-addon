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
RESTORE_FROM=$(jq -r '.restore_from // "none"' "$OPTIONS")
FORCE_RESTORE=$(jq -r '.force_restore // "false"' "$OPTIONS")
RESET_ADMIN_EMAIL=$(jq -r '.reset_admin_email // "none"' "$OPTIONS")
RESET_ADMIN_PASSWORD=$(jq -r '.reset_admin_password // "none"' "$OPTIONS")

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

# Dokumente aus Share laden falls vorhanden
if [ -d "/share/nebenkosten-dokumente" ]; then
    echo ">>> Lade Dokumente aus /share/nebenkosten-dokumente"
    cp -r /share/nebenkosten-dokumente/. /app/dokumente/
fi

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

# Backup einspielen
if [ "$RESTORE_FROM" != "none" ] && [ -f "$RESTORE_FROM" ]; then
    USER_COUNT=$(su postgres -c "psql -U nebenkosten -d nebenkosten -tAc 'SELECT COUNT(*) FROM users;'" 2>/dev/null || echo "0")
    if [ "$USER_COUNT" = "0" ] || [ "$FORCE_RESTORE" = "true" ]; then
        echo ">>> Spiele Backup ein: $RESTORE_FROM"
        su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /data/postgres -o '-c listen_addresses=localhost -c unix_socket_directories=/var/run/postgresql' start -w"
        if [ "$FORCE_RESTORE" = "true" ]; then
            echo ">>> Force-Restore: Datenbank wird zurückgesetzt..."
            su postgres -c "psql -c 'DROP DATABASE IF EXISTS nebenkosten;'"
            su postgres -c "psql -c 'CREATE DATABASE nebenkosten OWNER nebenkosten;'"
        fi
        su postgres -c "psql -d nebenkosten < '$RESTORE_FROM'"
        su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /data/postgres stop -w"
        echo ">>> Backup erfolgreich eingespielt."
    else
        echo ">>> Datenbank hat bereits Daten. Setze force_restore: true um zu überschreiben."
    fi
fi

# Admin-Passwort zurücksetzen: Info in Datei speichern, Reset erfolgt nach alembic-Migrationen
if [ "$RESET_ADMIN_EMAIL" != "none" ] && [ "$RESET_ADMIN_PASSWORD" != "none" ]; then
    echo ">>> Admin-Reset angefordert für: $RESET_ADMIN_EMAIL (wird nach DB-Migration ausgeführt)"
    printf '{"email":"%s","password":"%s"}' "$RESET_ADMIN_EMAIL" "$RESET_ADMIN_PASSWORD" > /data/reset_admin.json
fi

echo ">>> Starte alle Dienste..."
exec /usr/bin/supervisord -c /etc/supervisor/supervisord.conf
