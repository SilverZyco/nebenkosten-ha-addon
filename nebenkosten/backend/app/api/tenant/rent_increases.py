"""Tenant portal – rent increase notice signing."""
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
from app.models.apartment import Apartment
from app.models.rent_increase_notice import RentIncreaseNotice, RentIncreaseStatus

router = APIRouter(prefix="/tenant/rent-increases", tags=["tenant-rent-increases"])


async def _notice_response(notice: RentIncreaseNotice, db: AsyncSession) -> dict:
    apt_code = None
    apt_name = None
    if notice.apartment_id:
        res = await db.execute(select(Apartment).where(Apartment.id == notice.apartment_id))
        apt = res.scalar_one_or_none()
        if apt:
            apt_code = apt.code
            apt_name = apt.name

    return {
        "id": notice.id,
        "apartment_id": notice.apartment_id,
        "apartment_code": apt_code,
        "apartment_name": apt_name,
        "tenant_name": notice.tenant_name,
        "old_monthly_rent": float(notice.old_monthly_rent),
        "old_advance_payment": float(notice.old_advance_payment),
        "new_monthly_rent": float(notice.new_monthly_rent),
        "new_advance_payment": float(notice.new_advance_payment),
        "effective_date": str(notice.effective_date),
        "reason": notice.reason,
        "status": notice.status if isinstance(notice.status, str) else notice.status.value,
        "tenant_signed_at": notice.tenant_signed_at.isoformat() if notice.tenant_signed_at else None,
        "pdf_filename": notice.pdf_filename,
        "applied_to_tenancy": notice.applied_to_tenancy,
        "created_at": notice.created_at.isoformat(),
        "has_pdf": bool(notice.pdf_filename),
    }


@router.get("")
async def list_tenant_rent_increases(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return SENT and SIGNED rent increase notices for this tenant."""
    result = await db.execute(
        select(RentIncreaseNotice)
        .where(
            RentIncreaseNotice.tenant_user_id == current_user.id,
            RentIncreaseNotice.status.in_([RentIncreaseStatus.SENT, RentIncreaseStatus.SIGNED]),
        )
        .order_by(RentIncreaseNotice.created_at.desc())
    )
    notices = result.scalars().all()
    return [await _notice_response(n, db) for n in notices]


@router.post("/{notice_id}/sign")
async def sign_rent_increase(
    notice_id: str,
    body: dict,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Tenant signs rent increase notice digitally."""
    result = await db.execute(select(RentIncreaseNotice).where(RentIncreaseNotice.id == notice_id))
    notice = result.scalar_one_or_none()
    if not notice:
        raise HTTPException(status_code=404, detail="Mieterhöhung nicht gefunden")
    if notice.status != RentIncreaseStatus.SENT:
        raise HTTPException(status_code=400, detail="Mieterhöhung ist nicht zur Unterschrift freigegeben")
    if notice.tenant_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Kein Zugriff auf diese Mieterhöhung")

    signature_b64 = body.get("signature")
    if not signature_b64:
        raise HTTPException(status_code=400, detail="Unterschrift fehlt")

    client_ip = request.headers.get("X-Forwarded-For", request.client.host if request.client else "unknown")

    notice.tenant_signature = signature_b64
    notice.tenant_signed_at = datetime.now(timezone.utc)
    notice.tenant_signed_ip = client_ip
    notice.status = RentIncreaseStatus.SIGNED

    apt_result = await db.execute(select(Apartment).where(Apartment.id == notice.apartment_id))
    apt = apt_result.scalar_one_or_none()

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    filename = f"mieterhöhung_{notice.id}.pdf"
    output_path = os.path.join(settings.UPLOAD_DIR, filename)

    from app.services.rent_increase_pdf import generate_rent_increase_pdf
    success = generate_rent_increase_pdf(
        output_path=output_path,
        tenant_name=notice.tenant_name,
        tenant_address1=None,
        apartment_code=apt.code if apt else "",
        apartment_name=apt.name if apt else "",
        old_monthly_rent=notice.old_monthly_rent,
        old_advance_payment=notice.old_advance_payment,
        new_monthly_rent=notice.new_monthly_rent,
        new_advance_payment=notice.new_advance_payment,
        effective_date=notice.effective_date,
        reason=notice.reason,
        tenant_signature_b64=signature_b64,
        signed_at=notice.tenant_signed_at,
        signed_ip=client_ip,
    )
    if success:
        notice.pdf_filename = filename

    await db.commit()
    return await _notice_response(notice, db)


@router.get("/{notice_id}/pdf")
async def tenant_download_pdf(
    notice_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(RentIncreaseNotice).where(RentIncreaseNotice.id == notice_id))
    notice = result.scalar_one_or_none()
    if not notice or notice.status != RentIncreaseStatus.SIGNED:
        raise HTTPException(status_code=404, detail="Unterschriebene Mieterhöhung nicht gefunden")
    if notice.tenant_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Kein Zugriff")

    if not notice.pdf_filename:
        raise HTTPException(status_code=404, detail="PDF noch nicht vorhanden")

    pdf_path = os.path.join(settings.UPLOAD_DIR, notice.pdf_filename)
    if not os.path.exists(pdf_path):
        raise HTTPException(status_code=404, detail="PDF-Datei nicht gefunden")

    return FileResponse(
        path=pdf_path,
        filename=f"Mieterhöhung_{notice.tenant_name}.pdf",
        media_type="application/pdf",
    )
