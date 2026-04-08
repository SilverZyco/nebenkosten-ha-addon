"""Admin API – Bedienungsanleitungen (simple PDF upload + tenant assignment)."""
import os
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.deps import get_current_admin
from app.core.config import settings
from app.models.user import User
from app.models.instruction import Instruction

router = APIRouter(prefix="/instructions", tags=["admin-instructions"])

ALLOWED_TYPES = {"application/pdf", "image/jpeg", "image/png"}


@router.get("")
async def list_instructions(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    result = await db.execute(select(Instruction).order_by(Instruction.created_at.desc()))
    items = result.scalars().all()

    # Load tenant names separately
    tenant_ids = [i.tenant_user_id for i in items if i.tenant_user_id]
    tenant_map: dict = {}
    if tenant_ids:
        res = await db.execute(select(User).where(User.id.in_(tenant_ids)))
        for u in res.scalars().all():
            tenant_map[u.id] = u.name

    return [
        {
            "id": i.id,
            "title": i.title,
            "filename": i.filename,
            "is_sent": i.is_sent,
            "tenant_user_id": i.tenant_user_id,
            "tenant_name": tenant_map.get(i.tenant_user_id) if i.tenant_user_id else None,
            "created_at": i.created_at.isoformat(),
        }
        for i in items
    ]


@router.post("")
async def upload_instruction(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    if file.content_type not in ALLOWED_TYPES and not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Nur PDF-Dateien erlaubt")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Leere Datei")
    if len(content) > 50 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Datei zu groß (max. 50 MB)")

    safe_name = f"anleitung_{uuid.uuid4().hex}_{os.path.basename(file.filename or 'dokument.pdf')}"
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    dest = os.path.join(settings.UPLOAD_DIR, safe_name)
    with open(dest, "wb") as f:
        f.write(content)

    # Use original filename (without path) as title initially
    title = os.path.splitext(os.path.basename(file.filename or safe_name))[0]

    instruction = Instruction(
        title=title,
        filename=safe_name,
        created_at=datetime.now(timezone.utc),
    )
    db.add(instruction)
    await db.commit()
    await db.refresh(instruction)

    return {
        "id": instruction.id,
        "title": instruction.title,
        "filename": instruction.filename,
        "is_sent": instruction.is_sent,
        "tenant_user_id": None,
        "tenant_name": None,
        "created_at": instruction.created_at.isoformat(),
    }


@router.patch("/{instruction_id}")
async def update_instruction(
    instruction_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    result = await db.execute(select(Instruction).where(Instruction.id == instruction_id))
    instr = result.scalar_one_or_none()
    if not instr:
        raise HTTPException(status_code=404, detail="Anleitung nicht gefunden")

    if "title" in body:
        instr.title = body["title"]
    if "tenant_user_id" in body:
        uid = body["tenant_user_id"]
        if uid:
            res = await db.execute(select(User).where(User.id == uid))
            user = res.scalar_one_or_none()
            if not user:
                raise HTTPException(status_code=404, detail="Mieter nicht gefunden")
        instr.tenant_user_id = uid or None
        instr.is_sent = False  # reset sent status when reassigning

    await db.commit()
    return {"success": True}


@router.post("/{instruction_id}/send")
async def send_instruction(
    instruction_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    result = await db.execute(select(Instruction).where(Instruction.id == instruction_id))
    instr = result.scalar_one_or_none()
    if not instr:
        raise HTTPException(status_code=404, detail="Anleitung nicht gefunden")
    if not instr.tenant_user_id:
        raise HTTPException(status_code=400, detail="Kein Mieter zugewiesen")

    instr.is_sent = True
    await db.commit()
    return {"success": True}


@router.delete("/{instruction_id}")
async def delete_instruction(
    instruction_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    result = await db.execute(select(Instruction).where(Instruction.id == instruction_id))
    instr = result.scalar_one_or_none()
    if not instr:
        raise HTTPException(status_code=404, detail="Anleitung nicht gefunden")

    # Delete file
    file_path = os.path.join(settings.UPLOAD_DIR, instr.filename)
    if os.path.isfile(file_path):
        os.remove(file_path)

    await db.delete(instr)
    await db.commit()
    return {"success": True}


@router.get("/{instruction_id}/download")
async def download_instruction(
    instruction_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    result = await db.execute(select(Instruction).where(Instruction.id == instruction_id))
    instr = result.scalar_one_or_none()
    if not instr:
        raise HTTPException(status_code=404, detail="Anleitung nicht gefunden")

    file_path = os.path.join(settings.UPLOAD_DIR, instr.filename)
    if not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="Datei nicht gefunden")

    return FileResponse(path=file_path, filename=f"{instr.title}.pdf", media_type="application/pdf")
