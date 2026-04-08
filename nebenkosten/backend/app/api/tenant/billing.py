"""Tenant portal - read-only billing access."""
import os
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.config import settings
from app.models.user import User
from app.models.billing import ApartmentBilling, BillingPeriod
from app.models.apartment import Apartment
from app.models.tenancy import Tenancy

router = APIRouter(prefix="/tenant/billing", tags=["tenant-billing"])


@router.get("")
async def list_my_billings(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List released billings for the current tenant."""
    result = await db.execute(
        select(ApartmentBilling)
        .options(
            selectinload(ApartmentBilling.apartment),
            selectinload(ApartmentBilling.billing_period),
        )
        .where(
            ApartmentBilling.tenant_id == current_user.id,
            ApartmentBilling.is_released == True,
        )
        .order_by(ApartmentBilling.created_at.desc())
    )
    billings = result.scalars().all()

    return [
        {
            "id": ab.id,
            "year": ab.billing_period.year if ab.billing_period else None,
            "apartment_code": ab.apartment.code if ab.apartment else None,
            "apartment_name": ab.apartment.name if ab.apartment else None,
            "total_costs": str(ab.total_costs),
            "advance_payments": str(ab.advance_payments),
            "balance": str(ab.balance),
            "has_pdf": bool(ab.pdf_filename),
            "released_at": ab.released_at.isoformat() if ab.released_at else None,
            "receipt_filename": ab.receipt_filename,
        }
        for ab in billings
    ]


@router.get("/{billing_id}")
async def get_my_billing_detail(
    billing_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ApartmentBilling)
        .options(
            selectinload(ApartmentBilling.apartment),
            selectinload(ApartmentBilling.billing_period),
        )
        .where(
            ApartmentBilling.id == billing_id,
            ApartmentBilling.tenant_id == current_user.id,
            ApartmentBilling.is_released == True,
        )
    )
    ab = result.scalar_one_or_none()
    if not ab:
        raise HTTPException(status_code=404, detail="Abrechnung nicht gefunden")

    return {
        "id": ab.id,
        "year": ab.billing_period.year if ab.billing_period else None,
        "apartment_code": ab.apartment.code if ab.apartment else None,
        "apartment_name": ab.apartment.name if ab.apartment else None,
        "total_costs": str(ab.total_costs),
        "advance_payments": str(ab.advance_payments),
        "balance": str(ab.balance),
        "cost_breakdown": ab.cost_breakdown,
        "has_pdf": bool(ab.pdf_filename),
        "released_at": ab.released_at.isoformat() if ab.released_at else None,
        "receipt_filename": ab.receipt_filename,
    }


@router.get("/{billing_id}/pdf")
async def download_billing_pdf(
    billing_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ApartmentBilling)
        .where(
            ApartmentBilling.id == billing_id,
            ApartmentBilling.tenant_id == current_user.id,
            ApartmentBilling.is_released == True,
        )
    )
    ab = result.scalar_one_or_none()
    if not ab or not ab.pdf_filename:
        raise HTTPException(status_code=404, detail="PDF nicht verfügbar")

    file_path = os.path.join(settings.UPLOAD_DIR, ab.pdf_filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="PDF-Datei nicht gefunden")

    return FileResponse(path=file_path, filename=ab.pdf_filename, media_type="application/pdf")


@router.get("/{billing_id}/receipt")
async def tenant_download_receipt(
    billing_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Download receipt PDF if available."""
    result = await db.execute(
        select(ApartmentBilling).where(ApartmentBilling.id == billing_id)
    )
    ab = result.scalar_one_or_none()
    if not ab or not ab.receipt_filename:
        raise HTTPException(status_code=404, detail="Quittung nicht vorhanden")
    # Verify tenant access
    if ab.tenant_id != current_user.id and not ab.is_released:
        raise HTTPException(status_code=403, detail="Kein Zugriff")
    path = os.path.join(settings.UPLOAD_DIR, ab.receipt_filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Quittungs-PDF nicht gefunden. Bitte den Administrator bitten, die Quittung neu auszustellen.")
    return FileResponse(path=path, filename="Quittung.pdf", media_type="application/pdf")
