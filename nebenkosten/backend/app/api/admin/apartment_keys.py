from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from app.core.database import get_db
from app.core.deps import get_current_admin
from app.models.user import User
from app.models.apartment_key import ApartmentKey

router = APIRouter(prefix="/apartment-keys", tags=["admin-apartment-keys"])


VALID_KEY_TYPES = ("kombi", "mailbox", "keller", "sonstige")

class ApartmentKeyCreate(BaseModel):
    apartment_id: str
    key_type: str       # 'kombi' | 'mailbox' | 'keller' | 'sonstige'
    key_number: Optional[str] = None
    quantity: int = 1
    notes: Optional[str] = None


class ApartmentKeyUpdate(BaseModel):
    key_type: Optional[str] = None
    key_number: Optional[str] = None
    quantity: Optional[int] = None
    notes: Optional[str] = None


class ApartmentKeyResponse(BaseModel):
    id: str
    apartment_id: str
    key_type: str
    key_number: Optional[str]
    quantity: int
    notes: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


@router.get("", response_model=List[ApartmentKeyResponse])
async def list_keys(
    apartment_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    q = select(ApartmentKey).order_by(ApartmentKey.key_type, ApartmentKey.created_at)
    if apartment_id:
        q = q.where(ApartmentKey.apartment_id == apartment_id)
    result = await db.execute(q)
    return result.scalars().all()


@router.post("", response_model=ApartmentKeyResponse, status_code=201)
async def create_key(
    data: ApartmentKeyCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    if data.key_type not in VALID_KEY_TYPES:
        raise HTTPException(status_code=400, detail=f"key_type muss einer von {VALID_KEY_TYPES} sein")
    if data.quantity < 1:
        raise HTTPException(status_code=400, detail="Anzahl muss mindestens 1 sein")

    key = ApartmentKey(
        apartment_id=data.apartment_id,
        key_type=data.key_type,
        key_number=data.key_number,
        quantity=data.quantity,
        notes=data.notes,
    )
    db.add(key)
    await db.flush()
    return key


@router.put("/{key_id}", response_model=ApartmentKeyResponse)
async def update_key(
    key_id: str,
    data: ApartmentKeyUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    result = await db.execute(select(ApartmentKey).where(ApartmentKey.id == key_id))
    key = result.scalar_one_or_none()
    if not key:
        raise HTTPException(status_code=404, detail="Schlüssel nicht gefunden")

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(key, field, value)
    return key


@router.delete("/{key_id}", status_code=204)
async def delete_key(
    key_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    result = await db.execute(select(ApartmentKey).where(ApartmentKey.id == key_id))
    key = result.scalar_one_or_none()
    if not key:
        raise HTTPException(status_code=404, detail="Schlüssel nicht gefunden")
    await db.delete(key)
