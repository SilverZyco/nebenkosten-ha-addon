import io
import os
import re
import shutil
import subprocess
import tempfile
import zipfile
from datetime import datetime
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from app.core.deps import get_current_admin
from app.models.user import User

router = APIRouter(prefix="/backup", tags=["admin-backup"])

BACKUP_DIR  = os.environ.get("BACKUP_OUTPUT_DIR", "/backup-out")
UPLOAD_DIR  = os.environ.get("UPLOAD_DIR", "/data/uploads")

# PostgreSQL 16 Binaries (HA-Addon), Fallback auf PATH
_PG_BIN = "/usr/lib/postgresql/16/bin"
PG_DUMP = os.path.join(_PG_BIN, "pg_dump") if os.path.isdir(_PG_BIN) else "pg_dump"
PSQL    = os.path.join(_PG_BIN, "psql")    if os.path.isdir(_PG_BIN) else "psql"


def _db_credentials() -> dict:
    url = os.environ.get("DATABASE_URL_SYNC", "")
    m = re.match(r"postgresql://([^:]+):([^@]+)@([^:/]+)(?::(\d+))?/(.+)", url)
    if m:
        return {"user": m.group(1), "password": m.group(2),
                "host": m.group(3), "port": m.group(4) or "5432", "dbname": m.group(5)}
    return {
        "user":     os.environ.get("POSTGRES_USER",     "nebenkosten"),
        "password": os.environ.get("POSTGRES_PASSWORD", "changeme"),
        "host":     "localhost",
        "port":     "5432",
        "dbname":   os.environ.get("POSTGRES_DB",       "nebenkosten"),
    }


def _parse_filename_date(filename: str) -> str | None:
    try:
        stem = filename.replace("nebenkosten_", "").replace(".tar.gz", "")
        date_part, time_part = stem.split("_")
        dt = datetime(
            int(date_part[:4]), int(date_part[4:6]), int(date_part[6:8]),
            int(time_part[:2]), int(time_part[2:4]), int(time_part[4:6]),
        )
        return dt.strftime("%d.%m.%Y %H:%M")
    except Exception:
        return None


@router.get("/status")
async def backup_status(_: User = Depends(get_current_admin)):
    if not os.path.isdir(BACKUP_DIR):
        return {"configured": False, "backup_dir": BACKUP_DIR,
                "files": [], "last_backup": None, "total_size_mb": 0}

    files = []
    total_bytes = 0
    for fname in sorted(os.listdir(BACKUP_DIR), reverse=True):
        if not fname.endswith(".tar.gz"):
            continue
        fpath = os.path.join(BACKUP_DIR, fname)
        size_bytes = os.path.getsize(fpath)
        total_bytes += size_bytes
        files.append({
            "filename": fname,
            "size_mb": round(size_bytes / 1024 / 1024, 2),
            "created_at": _parse_filename_date(fname),
        })

    return {
        "configured": True,
        "backup_dir": BACKUP_DIR,
        "files": files,
        "last_backup": files[0]["created_at"] if files else None,
        "total_size_mb": round(total_bytes / 1024 / 1024, 2),
        "file_count": len(files),
    }


@router.post("/run")
async def run_backup(_: User = Depends(get_current_admin)):
    script = "/backup.sh"
    if os.path.isfile(script):
        try:
            result = subprocess.run(
                ["bash", script], capture_output=True, text=True, timeout=120,
            )
            if result.returncode != 0:
                raise HTTPException(status_code=500, detail=result.stderr[-500:])
            return {"success": True, "output": result.stdout[-1000:]}
        except subprocess.TimeoutExpired:
            raise HTTPException(status_code=504, detail="Backup-Timeout (>120s)")

    trigger = os.path.join(BACKUP_DIR, ".trigger")
    try:
        with open(trigger, "w") as f:
            f.write(datetime.utcnow().isoformat())
        return {"success": True, "output": "Trigger gesetzt – Backup startet gleich."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/export")
async def export_backup(_: User = Depends(get_current_admin)):
    """
    Erstellt ein vollständiges Backup als ZIP:
    - database.sql  (pg_dump der gesamten Datenbank)
    - uploads/      (alle hochgeladenen Dateien, Dokumente, Bilder)
    """
    db = _db_credentials()
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"nebenkosten_backup_{timestamp}.zip"

    # 1. Datenbank dumpen
    try:
        result = subprocess.run(
            [
                PG_DUMP,
                "--clean", "--if-exists", "--no-owner", "--no-acl",
                "-h", db["host"], "-p", db["port"], "-U", db["user"], db["dbname"],
            ],
            capture_output=True,
            env={**os.environ, "PGPASSWORD": db["password"]},
            timeout=120,
        )
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="pg_dump nicht gefunden")
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="pg_dump Timeout (>120s)")

    if result.returncode != 0:
        raise HTTPException(
            status_code=500,
            detail=result.stderr.decode("utf-8", errors="replace")[-500:],
        )

    sql_data = result.stdout

    # 2. ZIP im Speicher erstellen
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        # Datenbank
        zf.writestr("database.sql", sql_data)

        # Uploads-Ordner
        if os.path.isdir(UPLOAD_DIR):
            for root, _, files in os.walk(UPLOAD_DIR):
                for fname in files:
                    fpath = os.path.join(root, fname)
                    arcname = os.path.join("uploads", os.path.relpath(fpath, UPLOAD_DIR))
                    zf.write(fpath, arcname)

    zip_bytes = buf.getvalue()

    return StreamingResponse(
        io.BytesIO(zip_bytes),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(len(zip_bytes)),
        },
    )


@router.post("/restore")
async def restore_backup(
    file: UploadFile = File(...),
    _: User = Depends(get_current_admin),
):
    """
    Stellt ein vollständiges Backup aus einer ZIP-Datei wieder her.
    Erwartet das Format wie es /export erstellt:
    - database.sql
    - uploads/ (optional)
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="Keine Datei")

    fname_lower = file.filename.lower()
    if not (fname_lower.endswith(".zip") or fname_lower.endswith(".sql")):
        raise HTTPException(status_code=400, detail="Nur .zip oder .sql Dateien erlaubt")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Leere Datei")

    db = _db_credentials()

    with tempfile.TemporaryDirectory() as tmpdir:

        if fname_lower.endswith(".zip"):
            # ZIP entpacken
            try:
                with zipfile.ZipFile(io.BytesIO(content)) as zf:
                    zf.extractall(tmpdir)
            except zipfile.BadZipFile:
                raise HTTPException(status_code=400, detail="Ungültige ZIP-Datei")

            sql_path = os.path.join(tmpdir, "database.sql")
            if not os.path.isfile(sql_path):
                raise HTTPException(status_code=400, detail="database.sql nicht in ZIP gefunden")

            with open(sql_path, "rb") as f:
                sql_data = f.read()

            # Uploads wiederherstellen
            uploads_src = os.path.join(tmpdir, "uploads")
            if os.path.isdir(uploads_src):
                if os.path.isdir(UPLOAD_DIR):
                    shutil.rmtree(UPLOAD_DIR)
                shutil.copytree(uploads_src, UPLOAD_DIR)

        else:
            # Einfaches .sql File
            sql_data = content

        # Datenbank wiederherstellen
        try:
            result = subprocess.run(
                [PSQL, "-h", db["host"], "-p", db["port"], "-U", db["user"], "-d", db["dbname"]],
                input=sql_data,
                capture_output=True,
                env={**os.environ, "PGPASSWORD": db["password"]},
                timeout=300,
            )
        except FileNotFoundError:
            raise HTTPException(status_code=500, detail="psql nicht gefunden")
        except subprocess.TimeoutExpired:
            raise HTTPException(status_code=504, detail="Restore Timeout (>300s)")

        if result.returncode != 0:
            stderr = result.stderr.decode("utf-8", errors="replace")
            error_lines = [l for l in stderr.splitlines() if "ERROR" in l]
            if error_lines:
                raise HTTPException(status_code=500, detail="\n".join(error_lines[-10:]))

    return {"success": True, "message": "Datenbank und Dateien erfolgreich wiederhergestellt"}
