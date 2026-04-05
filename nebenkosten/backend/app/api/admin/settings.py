from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.deps import get_current_admin
from app.models.user import User
from app.models.settings import BuildingSettings

router = APIRouter(prefix="/settings", tags=["admin-settings"])

SETTINGS_FIELDS = (
    "water_main_meter_id", "gas_main_meter_id", "electricity_common_meter_id",
    "house_address", "owner_name", "rental_address",
    "bank_name", "bank_iban", "bank_bic", "bank_account_holder",
)


async def _get_or_create(db: AsyncSession) -> BuildingSettings:
    result = await db.execute(select(BuildingSettings).limit(1))
    s = result.scalar_one_or_none()
    if not s:
        s = BuildingSettings()
        db.add(s)
        await db.flush()
    return s


def _to_dict(s: BuildingSettings) -> dict:
    return {f: getattr(s, f, None) for f in SETTINGS_FIELDS}


@router.get("")
async def get_settings(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    s = await _get_or_create(db)
    return _to_dict(s)


@router.put("")
async def update_settings(
    data: dict,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    s = await _get_or_create(db)
    for field in SETTINGS_FIELDS:
        if field in data:
            setattr(s, field, data[field] or None)
    return _to_dict(s)
