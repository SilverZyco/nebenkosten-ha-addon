from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete as sql_delete, text
from app.core.database import get_db
from app.core.deps import get_current_admin, get_current_user
from app.core.security import get_password_hash, verify_password
from app.models.user import User
from app.models.tenancy import Tenancy
from app.schemas.user import UserCreate, UserUpdate, UserResponse

router = APIRouter(prefix="/users", tags=["admin-users"])


@router.get("", response_model=List[UserResponse])
async def list_users(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    result = await db.execute(select(User).order_by(User.name))
    return result.scalars().all()


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    data: UserCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    import uuid as _uuid, re
    email = data.email or ""
    if not email.strip():
        slug = re.sub(r"[^a-z0-9]", ".", data.name.lower().strip())[:30]
        email = f"{slug}.{_uuid.uuid4().hex[:6]}@portal.intern"

    existing = await db.execute(select(User).where(User.email == email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="E-Mail bereits vergeben")

    user = User(
        email=email,
        name=data.name,
        password_hash=get_password_hash(data.password),
        role=data.role,
        phone=data.phone,
    )
    db.add(user)
    await db.flush()
    return user


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: str,
    data: UserUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Benutzer nicht gefunden")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(user, field, value)
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    if user_id == current_admin.id:
        raise HTTPException(status_code=400, detail="Eigenes Konto kann nicht gelöscht werden")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Benutzer nicht gefunden")

    # Check for existing tenancies
    tenancy_result = await db.execute(
        select(Tenancy).where(Tenancy.tenant_id == user_id).limit(1)
    )
    if tenancy_result.scalar_one_or_none():
        raise HTTPException(
            status_code=400,
            detail="Mieter hat Mietverhältnisse und kann nicht gelöscht werden. Bitte zuerst alle Mietverhältnisse beenden.",
        )

    # Remove audit_logs (FK) before deleting user
    await db.execute(text("DELETE FROM audit_logs WHERE user_id = :uid"), {"uid": user_id})
    await db.delete(user)


@router.post("/{user_id}/reset-password", status_code=status.HTTP_204_NO_CONTENT)
async def reset_user_password(
    user_id: str,
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    """Admin resets another user's password."""
    if user_id == current_admin.id:
        raise HTTPException(status_code=400, detail="Eigenes Passwort bitte über das Profil ändern")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Benutzer nicht gefunden")
    new_pw = data.get("new_password", "")
    if not new_pw or len(new_pw) < 6:
        raise HTTPException(status_code=400, detail="Passwort muss mindestens 6 Zeichen lang sein")
    user.password_hash = get_password_hash(new_pw)


# ── Own profile (any logged-in user) ────────────────────────────────────────

@router.put("/me/profile", response_model=UserResponse)
async def update_own_profile(
    data: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Any user can update their own name, email, phone."""
    for field, value in data.model_dump(exclude_none=True).items():
        if field == "is_active":
            continue  # can't deactivate yourself
        setattr(current_user, field, value)
    return current_user


@router.post("/me/password", status_code=status.HTTP_204_NO_CONTENT)
async def change_own_password(
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Change own password — requires current password."""
    old_pw = data.get("old_password", "")
    new_pw = data.get("new_password", "")
    if not new_pw or len(new_pw) < 6:
        raise HTTPException(status_code=400, detail="Neues Passwort muss mindestens 6 Zeichen lang sein")
    if not verify_password(old_pw, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Aktuelles Passwort falsch")
    current_user.password_hash = get_password_hash(new_pw)
