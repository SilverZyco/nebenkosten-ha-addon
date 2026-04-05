"""Tenant portal – rental contract signing."""
import os
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.config import settings
from app.models.user import User
from app.models.rental_contract import RentalContract, RentalContractStatus
from app.models.apartment import Apartment

router = APIRouter(prefix="/tenant/rental-contracts", tags=["tenant-rental-contracts"])


async def _contract_response(contract: RentalContract, db: AsyncSession) -> dict:
    apt_code = None
    apt_name = None
    if contract.apartment_id:
        res = await db.execute(select(Apartment).where(Apartment.id == contract.apartment_id))
        apt = res.scalar_one_or_none()
        if apt:
            apt_code = apt.code
            apt_name = apt.name
    return {
        "id": contract.id,
        "apartment_id": contract.apartment_id,
        "apartment_code": apt_code,
        "apartment_name": apt_name,
        "tenant_name": contract.tenant_name,
        "start_date": str(contract.start_date),
        "monthly_rent": float(contract.monthly_rent),
        "advance_payment": float(contract.advance_payment),
        "kitchen_fee": float(contract.kitchen_fee) if contract.kitchen_fee else None,
        "deposit": float(contract.deposit),
        "special_notes": contract.special_notes,
        "status": contract.status.value,
        "tenant_signed_at": contract.tenant_signed_at.isoformat() if contract.tenant_signed_at else None,
        "pdf_filename": contract.pdf_filename,
        "created_at": contract.created_at.isoformat(),
        "has_pdf": bool(contract.pdf_filename),
    }


@router.get("")
async def list_tenant_contracts(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return SENT and SIGNED contracts directly assigned to this user."""
    result = await db.execute(
        select(RentalContract)
        .where(
            RentalContract.tenant_user_id == current_user.id,
            RentalContract.status.in_([RentalContractStatus.SENT, RentalContractStatus.SIGNED]),
        )
        .order_by(RentalContract.created_at.desc())
    )
    contracts = result.scalars().all()
    return [await _contract_response(c, db) for c in contracts]


@router.post("/{contract_id}/sign")
async def sign_contract(
    contract_id: str,
    body: dict,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Save tenant signature and generate signed PDF."""
    result = await db.execute(select(RentalContract).where(RentalContract.id == contract_id))
    contract = result.scalar_one_or_none()
    if not contract:
        raise HTTPException(status_code=404, detail="Vertrag nicht gefunden")
    if contract.status != RentalContractStatus.SENT:
        raise HTTPException(status_code=400, detail="Vertrag ist nicht zur Unterschrift freigegeben")
    if contract.tenant_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Kein Zugriff auf diesen Vertrag")

    signature_b64 = body.get("signature")
    if not signature_b64:
        raise HTTPException(status_code=400, detail="Unterschrift fehlt")

    client_ip = request.headers.get("X-Forwarded-For", request.client.host if request.client else "unknown")

    contract.tenant_signature = signature_b64
    contract.tenant_signed_at = datetime.now(timezone.utc)
    contract.tenant_signed_ip = client_ip
    contract.status = RentalContractStatus.SIGNED

    apt_result = await db.execute(select(Apartment).where(Apartment.id == contract.apartment_id))
    apt = apt_result.scalar_one_or_none()

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    filename = f"mietvertrag_{contract.id}.pdf"
    output_path = os.path.join(settings.UPLOAD_DIR, filename)

    from app.services.rental_contract_pdf import generate_rental_contract_pdf
    success = generate_rental_contract_pdf(
        output_path=output_path,
        tenant_name=contract.tenant_name,
        tenant_address1=contract.tenant_address1,
        tenant_address2=contract.tenant_address2,
        tenant_address3=contract.tenant_address3,
        apartment_code=apt.code if apt else "",
        apartment_name=apt.name if apt else "",
        apartment_area_sqm=apt.area_sqm if apt else None,
        start_date=contract.start_date,
        monthly_rent=contract.monthly_rent,
        advance_payment=contract.advance_payment,
        kitchen_fee=contract.kitchen_fee,
        deposit=contract.deposit,
        special_notes=contract.special_notes,
        tenant_signature_b64=signature_b64,
        signed_at=contract.tenant_signed_at,
        signed_ip=client_ip,
        has_cellar=getattr(contract, "has_cellar", True),
        deposit_months=getattr(contract, "deposit_months", 3),
    )
    if success:
        contract.pdf_filename = filename

    await db.commit()
    return await _contract_response(contract, db)


@router.get("/{contract_id}/pdf")
async def tenant_download_pdf(
    contract_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(RentalContract).where(RentalContract.id == contract_id))
    contract = result.scalar_one_or_none()
    if not contract or contract.status != RentalContractStatus.SIGNED:
        raise HTTPException(status_code=404, detail="Unterzeichneter Vertrag nicht gefunden")
    if contract.tenant_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Kein Zugriff")

    if not contract.pdf_filename:
        raise HTTPException(status_code=404, detail="PDF noch nicht vorhanden")

    pdf_path = os.path.join(settings.UPLOAD_DIR, contract.pdf_filename)
    if not os.path.exists(pdf_path):
        raise HTTPException(status_code=404, detail="PDF-Datei nicht gefunden")

    return FileResponse(
        path=pdf_path,
        filename=f"Mietvertrag_{contract.tenant_name}.pdf",
        media_type="application/pdf",
    )
