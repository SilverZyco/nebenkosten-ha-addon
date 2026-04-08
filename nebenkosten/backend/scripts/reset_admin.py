#!/usr/bin/env python3
"""Setzt Admin-Passwort zurück wenn /data/reset_admin.json vorhanden."""
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

RESET_FILE = Path("/data/reset_admin.json")

if not RESET_FILE.exists():
    sys.exit(0)

try:
    data = json.loads(RESET_FILE.read_text())
    email = data.get("email", "").strip()
    password = data.get("password", "").strip()
except Exception as e:
    print(f">>> Fehler beim Lesen der Reset-Datei: {e}")
    RESET_FILE.unlink(missing_ok=True)
    sys.exit(0)

if not email or not password:
    print(">>> Admin-Reset: E-Mail oder Passwort leer, überspringe.")
    RESET_FILE.unlink(missing_ok=True)
    sys.exit(0)

from passlib.context import CryptContext
from sqlalchemy import create_engine, text
from app.core.config import settings

ctx = CryptContext(schemes=["bcrypt"])
new_hash = ctx.hash(password)

engine = create_engine(settings.DATABASE_URL_SYNC)
try:
    with engine.connect() as conn:
        result = conn.execute(
            text(
                "UPDATE users SET password_hash=:hash, email=:email "
                "WHERE id=(SELECT id FROM users WHERE role='admin' ORDER BY created_at LIMIT 1) "
                "RETURNING email"
            ),
            {"hash": new_hash, "email": email},
        )
        row = result.fetchone()
        conn.commit()
    if row:
        print(f">>> Admin-Passwort erfolgreich zurückgesetzt für: {row[0]}")
    else:
        print(">>> Kein Admin-Nutzer gefunden.")
except Exception as e:
    print(f">>> Fehler beim Admin-Reset: {e}")
finally:
    RESET_FILE.unlink(missing_ok=True)
