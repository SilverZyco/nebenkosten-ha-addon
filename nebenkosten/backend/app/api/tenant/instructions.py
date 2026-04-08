"""Tenant portal – Bedienungsanleitungen (read-only)."""
import os
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.config import settings
from app.models.user import User
from app.models.instruction import Instruction

router = APIRouter(prefix="/tenant/instructions", tags=["tenant-instructions"])


@router.get("")
async def list_my_instructions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Instruction)
        .where(
            Instruction.tenant_user_id == current_user.id,
            Instruction.is_sent == True,
        )
        .order_by(Instruction.created_at.desc())
    )
    items = result.scalars().all()
    return [
        {
            "id": i.id,
            "title": i.title,
            "created_at": i.created_at.isoformat(),
        }
        for i in items
    ]


@router.get("/{instruction_id}/download")
async def download_instruction(
    instruction_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Instruction)
        .where(
            Instruction.id == instruction_id,
            Instruction.tenant_user_id == current_user.id,
            Instruction.is_sent == True,
        )
    )
    instr = result.scalar_one_or_none()
    if not instr:
        raise HTTPException(status_code=404, detail="Anleitung nicht gefunden")

    file_path = os.path.join(settings.UPLOAD_DIR, instr.filename)
    if not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="Datei nicht gefunden")

    return FileResponse(path=file_path, filename=f"{instr.title}.pdf", media_type="application/pdf")
