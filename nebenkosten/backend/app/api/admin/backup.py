import os
import subprocess
from datetime import datetime
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from app.core.deps import get_current_admin
from app.models.user import User

router = APIRouter(prefix="/backup", tags=["admin-backup"])

BACKUP_DIR = os.environ.get("BACKUP_OUTPUT_DIR", "/backup-out")


def _parse_filename_date(filename: str) -> str | None:
    """Extract date from nebenkosten_YYYYMMDD_HHMMSS.tar.gz"""
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
        return {
            "configured": False,
            "backup_dir": BACKUP_DIR,
            "files": [],
            "last_backup": None,
            "total_size_mb": 0,
        }

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
    """Manuelles Backup auslösen – läuft im Backup-Container."""
    script = "/backup.sh"

    # Versuche backup.sh direkt auszuführen (falls im gleichen Container)
    if os.path.isfile(script):
        try:
            result = subprocess.run(
                ["bash", script],
                capture_output=True, text=True, timeout=120,
            )
            if result.returncode != 0:
                raise HTTPException(status_code=500, detail=result.stderr[-500:])
            return {"success": True, "output": result.stdout[-1000:]}
        except subprocess.TimeoutExpired:
            raise HTTPException(status_code=504, detail="Backup-Timeout (>120s)")

    # Backup läuft in separatem Container – Trigger-Datei anlegen
    trigger = os.path.join(BACKUP_DIR, ".trigger")
    try:
        with open(trigger, "w") as f:
            f.write(datetime.utcnow().isoformat())
        return {"success": True, "output": "Trigger gesetzt – Backup startet gleich."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
