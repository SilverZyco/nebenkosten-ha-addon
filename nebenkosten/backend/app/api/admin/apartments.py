from typing import List
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.core.deps import get_current_admin
from app.models.user import User
from app.models.apartment import Apartment, WasteBinMapping
from app.models.tenancy import Tenancy
from app.schemas.apartment import (
    ApartmentCreate, ApartmentUpdate, ApartmentResponse,
    WasteBinMappingCreate, WasteBinMappingResponse,
    TenancyCreate, TenancyUpdate, TenancyResponse
)

router = APIRouter(prefix="/apartments", tags=["admin-apartments"])


@router.get("", response_model=List[ApartmentResponse])
async def list_apartments(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    result = await db.execute(
        select(Apartment)
        .options(selectinload(Apartment.waste_bin_mappings))
        .order_by(Apartment.code)
    )
    return result.scalars().all()


@router.get("/{apt_id}", response_model=ApartmentResponse)
async def get_apartment(
    apt_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    result = await db.execute(
        select(Apartment)
        .options(selectinload(Apartment.waste_bin_mappings))
        .where(Apartment.id == apt_id)
    )
    apt = result.scalar_one_or_none()
    if not apt:
        raise HTTPException(status_code=404, detail="Wohnung nicht gefunden")
    return apt


@router.post("", response_model=ApartmentResponse, status_code=status.HTTP_201_CREATED)
async def create_apartment(
    data: ApartmentCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    apt = Apartment(**data.model_dump())
    db.add(apt)
    await db.flush()
    result = await db.execute(
        select(Apartment)
        .options(selectinload(Apartment.waste_bin_mappings))
        .where(Apartment.id == apt.id)
    )
    return result.scalar_one()


@router.put("/{apt_id}", response_model=ApartmentResponse)
async def update_apartment(
    apt_id: str,
    data: ApartmentUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    result = await db.execute(select(Apartment).where(Apartment.id == apt_id))
    apt = result.scalar_one_or_none()
    if not apt:
        raise HTTPException(status_code=404, detail="Wohnung nicht gefunden")

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(apt, field, value)
    await db.flush()
    result = await db.execute(
        select(Apartment)
        .options(selectinload(Apartment.waste_bin_mappings))
        .where(Apartment.id == apt_id)
    )
    return result.scalar_one()


# --- Waste Bin Mappings ---

@router.get("/{apt_id}/waste-bins", response_model=List[WasteBinMappingResponse])
async def list_waste_bins(
    apt_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    result = await db.execute(
        select(WasteBinMapping).where(WasteBinMapping.apartment_id == apt_id)
    )
    return result.scalars().all()


@router.post("/waste-bins", response_model=WasteBinMappingResponse, status_code=status.HTTP_201_CREATED)
async def create_waste_bin_mapping(
    data: WasteBinMappingCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    payload = data.model_dump()
    if not payload.get("valid_from"):
        payload["valid_from"] = date.today()
    mapping = WasteBinMapping(**payload)
    db.add(mapping)
    await db.flush()
    return mapping


@router.put("/waste-bins/{bin_id}", response_model=WasteBinMappingResponse)
async def update_waste_bin_mapping(
    bin_id: str,
    data: WasteBinMappingCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    result = await db.execute(select(WasteBinMapping).where(WasteBinMapping.id == bin_id))
    mapping = result.scalar_one_or_none()
    if not mapping:
        raise HTTPException(status_code=404, detail="Tonnen-Zuordnung nicht gefunden")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(mapping, field, value)
    return mapping


@router.delete("/waste-bins/{bin_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_waste_bin_mapping(
    bin_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    result = await db.execute(select(WasteBinMapping).where(WasteBinMapping.id == bin_id))
    mapping = result.scalar_one_or_none()
    if not mapping:
        raise HTTPException(status_code=404, detail="Tonnen-Zuordnung nicht gefunden")
    await db.delete(mapping)


# --- All waste bins ---
@router.get("/waste-bins/all", response_model=List[WasteBinMappingResponse])
async def list_all_waste_bins(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    result = await db.execute(select(WasteBinMapping).order_by(WasteBinMapping.bin_id))
    return result.scalars().all()


# --- Tenancies ---

@router.get("/{apt_id}/tenancies", response_model=List[TenancyResponse])
async def list_tenancies(
    apt_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    from sqlalchemy.orm import selectinload
    result = await db.execute(
        select(Tenancy)
        .options(selectinload(Tenancy.tenant), selectinload(Tenancy.apartment))
        .where(Tenancy.apartment_id == apt_id)
        .order_by(Tenancy.start_date.desc())
    )
    tenancies = result.scalars().all()
    resp = []
    for t in tenancies:
        r = TenancyResponse.model_validate(t)
        r.tenant_name = t.tenant.name if t.tenant else None
        r.apartment_code = t.apartment.code if t.apartment else None
        resp.append(r)
    return resp


@router.post("/tenancies", response_model=TenancyResponse, status_code=status.HTTP_201_CREATED)
async def create_tenancy(
    data: TenancyCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    from sqlalchemy.orm import selectinload
    tenancy = Tenancy(**data.model_dump())
    db.add(tenancy)
    await db.flush()
    result = await db.execute(
        select(Tenancy)
        .options(selectinload(Tenancy.tenant), selectinload(Tenancy.apartment))
        .where(Tenancy.id == tenancy.id)
    )
    t = result.scalar_one()
    r = TenancyResponse.model_validate(t)
    r.tenant_name = t.tenant.name if t.tenant else None
    r.apartment_code = t.apartment.code if t.apartment else None
    return r


@router.put("/tenancies/{tenancy_id}", response_model=TenancyResponse)
async def update_tenancy(
    tenancy_id: str,
    data: TenancyUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    from sqlalchemy.orm import selectinload
    result = await db.execute(
        select(Tenancy)
        .options(selectinload(Tenancy.tenant), selectinload(Tenancy.apartment))
        .where(Tenancy.id == tenancy_id)
    )
    tenancy = result.scalar_one_or_none()
    if not tenancy:
        raise HTTPException(status_code=404, detail="Mietverhältnis nicht gefunden")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(tenancy, field, value)
    await db.flush()
    r = TenancyResponse.model_validate(tenancy)
    r.tenant_name = tenancy.tenant.name if tenancy.tenant else None
    r.apartment_code = tenancy.apartment.code if tenancy.apartment else None
    return r


@router.delete("/tenancies/{tenancy_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tenancy(
    tenancy_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    result = await db.execute(select(Tenancy).where(Tenancy.id == tenancy_id))
    tenancy = result.scalar_one_or_none()
    if not tenancy:
        raise HTTPException(status_code=404, detail="Mietverhältnis nicht gefunden")
    await db.delete(tenancy)
