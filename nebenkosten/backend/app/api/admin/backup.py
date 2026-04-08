import io
import os
import re
import shutil
import subprocess
import tarfile
import tempfile
from datetime import datetime
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from app.core.deps import get_current_admin
from app.models.user import User

router = APIRouter(prefix="/backup", tags=["admin-backup"])

BACKUP_DIR = os.environ.get("BACKUP_OUTPUT_DIR", "/backup-out")
UPLOAD_DIR = os.environ.get("UPLOAD_DIR", "/data/uploads")

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


@router.get("/download")
async def download_backup(_: User = Depends(get_current_admin)):
    """
    Erstellt ein vollständiges Backup on-the-fly und schickt es als Download:
      1. pg_dump → database.sql
      2. uploads/ → uploads.tar.gz
      3. Beide in nebenkosten_DATUM.tar.gz gepackt → Browser-Download
    """
    db = _db_credentials()
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    archive_name = f"nebenkosten_{timestamp}.tar.gz"

    # 1. Datenbank dumpen
    try:
        result = subprocess.run(
            [
                PG_DUMP,
                "--no-owner", "--no-acl",
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

    sql_bytes = result.stdout

    # 2. Haupt-Archiv im Speicher bauen
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:

        # database.sql hinzufügen
        sql_info = tarfile.TarInfo(name="database.sql")
        sql_info.size = len(sql_bytes)
        tar.addfile(sql_info, io.BytesIO(sql_bytes))

        # uploads.tar.gz bauen und einbetten
        uploads_buf = io.BytesIO()
        with tarfile.open(fileobj=uploads_buf, mode="w:gz") as uploads_tar:
            if os.path.isdir(UPLOAD_DIR):
                uploads_tar.add(UPLOAD_DIR, arcname="uploads")
        uploads_bytes = uploads_buf.getvalue()

        uploads_info = tarfile.TarInfo(name="uploads.tar.gz")
        uploads_info.size = len(uploads_bytes)
        tar.addfile(uploads_info, io.BytesIO(uploads_bytes))

    archive_bytes = buf.getvalue()

    return StreamingResponse(
        io.BytesIO(archive_bytes),
        media_type="application/x-tar",
        headers={
            "Content-Disposition": f'attachment; filename="{archive_name}"',
            "Content-Length": str(len(archive_bytes)),
        },
    )


@router.post("/restore")
async def restore_backup(
    file: UploadFile = File(...),
    _: User = Depends(get_current_admin),
):
    """
    Spielt ein vollständiges Backup aus einer .tar.gz-Datei ein:
      1. In /tmp entpacken
      2. database.sql finden
      3. psql: Schema leeren → SQL einspielen
      4. uploads.tar.gz → UPLOAD_DIR entpacken
      5. Temp-Verzeichnis löschen
    """
    if not file.filename or not file.filename.endswith(".tar.gz"):
        raise HTTPException(status_code=400, detail="Nur .tar.gz Dateien werden akzeptiert")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Leere Datei")

    db = _db_credentials()

    with tempfile.TemporaryDirectory() as tmpdir:

        # 1. Archiv entpacken
        try:
            with tarfile.open(fileobj=io.BytesIO(content), mode="r:gz") as tar:
                try:
                    tar.extractall(tmpdir, filter="data")
                except TypeError:
                    tar.extractall(tmpdir)  # Python < 3.12
        except tarfile.TarError as e:
            raise HTTPException(status_code=400, detail=f"Ungültige tar.gz-Datei: {e}")

        # 2. database.sql rekursiv suchen (kann in Unterverzeichnis liegen)
        sql_path = None
        for root, _, files in os.walk(tmpdir):
            if "database.sql" in files:
                sql_path = os.path.join(root, "database.sql")
                break

        if not sql_path:
            raise HTTPException(status_code=400, detail="database.sql nicht im Archiv gefunden")

        # 3. Schema leeren und SQL einspielen
        pg_env = {**os.environ, "PGPASSWORD": db["password"]}
        pg_base = ["-h", db["host"], "-p", db["port"], "-U", db["user"]]

        # Erst alle anderen Verbindungen zur DB trennen (als postgres Superuser via Unix Socket)
        # Notwendig damit DROP SCHEMA nicht auf aktive Verbindungen wartet
        terminate_sql = (
            f"SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
            f"WHERE datname='{db['dbname']}' AND pid <> pg_backend_pid();"
        )
        subprocess.run(
            ["su", "postgres", "-c", f"{PSQL} -d postgres -c \"{terminate_sql}\""],
            capture_output=True,
            timeout=15,
        )

        # Schema leeren
        drop_sql = "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO public;"
        try:
            drop_result = subprocess.run(
                [PSQL] + pg_base + ["-d", db["dbname"], "-c", drop_sql],
                capture_output=True,
                env=pg_env,
                timeout=60,
            )
        except subprocess.TimeoutExpired:
            raise HTTPException(status_code=504, detail="Schema-Reset Timeout")

        if drop_result.returncode != 0:
            raise HTTPException(
                status_code=500,
                detail=drop_result.stderr.decode("utf-8", errors="replace")[-300:],
            )

        # SQL einspielen
        with open(sql_path, "rb") as f:
            sql_data = f.read()

        try:
            restore_result = subprocess.run(
                [PSQL] + pg_base + ["-d", db["dbname"]],
                input=sql_data,
                capture_output=True,
                env=pg_env,
                timeout=300,
            )
        except subprocess.TimeoutExpired:
            raise HTTPException(status_code=504, detail="Restore Timeout (>300s)")

        # Harmlose Fehler ignorieren (z.B. "already exists" wenn alembic Tabellen vorab erstellt hat)
        if restore_result.returncode != 0:
            stderr = restore_result.stderr.decode("utf-8", errors="replace")
            fatal_errors = [
                l for l in stderr.splitlines()
                if "ERROR" in l
                and "already exists" not in l
                and "does not exist" not in l
            ]
            if fatal_errors:
                raise HTTPException(status_code=500, detail="\n".join(fatal_errors[-10:]))

        # 4. uploads.tar.gz rekursiv suchen → UPLOAD_DIR
        uploads_archive = None
        for root, _, files in os.walk(tmpdir):
            if "uploads.tar.gz" in files:
                uploads_archive = os.path.join(root, "uploads.tar.gz")
                break

        if uploads_archive and os.path.isfile(uploads_archive):
            if os.path.isdir(UPLOAD_DIR):
                shutil.rmtree(UPLOAD_DIR)
            os.makedirs(UPLOAD_DIR, exist_ok=True)
            try:
                with tarfile.open(uploads_archive, mode="r:gz") as uploads_tar:
                    uploads_tar.extractall(os.path.dirname(UPLOAD_DIR))
            except tarfile.TarError as e:
                raise HTTPException(status_code=500, detail=f"Fehler beim Entpacken der Uploads: {e}")

    # Alembic-Migrationen nach Restore ausführen (stellt fehlende Tabellen/Spalten sicher)
    try:
        alembic_result = subprocess.run(
            ["python", "-m", "alembic", "upgrade", "head"],
            capture_output=True,
            cwd="/app/backend",
            env={**os.environ},
            timeout=120,
        )
        if alembic_result.returncode != 0:
            # Nicht fatal - nur loggen
            print(f"Alembic nach Restore: {alembic_result.stderr.decode('utf-8', errors='replace')[-300:]}")
    except Exception:
        pass

    return {"success": True, "message": "Datenbank und Dateien erfolgreich wiederhergestellt. Bitte Seite neu laden."}
