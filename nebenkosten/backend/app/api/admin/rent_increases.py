"""Admin API for Mieterhöhungsschreiben (rent increase notices)."""
import os
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_
from app.core.database import get_db
from app.core.deps import get_current_admin
from app.core.config import settings
from app.models.user import User
from app.models.apartment import Apartment
from app.models.rent_increase_notice import RentIncreaseNotice, RentIncreaseStatus
from app.models.tenancy import Tenancy

router = APIRouter(prefix="/rent-increases", tags=["admin-rent-increases"])

FLOOR_LABELS = {
    "EG": "Erdgeschoss",
    "OG": "Obergeschoss",
    "DG": "Dachgeschoss",
    "DU": "Büro",
}


class RentIncreaseCreate(BaseModel):
    apartment_id: str
    tenant_user_id: Optional[str] = None
    tenant_name: str
    old_monthly_rent: Decimal
    old_advance_payment: Decimal
    new_monthly_rent: Decimal
    new_advance_payment: Decimal
    effective_date: str  # ISO date string
    reason: Optional[str] = None


class RentIncreaseUpdate(BaseModel):
    tenant_user_id: Optional[str] = None
    tenant_name: Optional[str] = None
    old_monthly_rent: Optional[Decimal] = None
    old_advance_payment: Optional[Decimal] = None
    new_monthly_rent: Optional[Decimal] = None
    new_advance_payment: Optional[Decimal] = None
    effective_date: Optional[str] = None
    reason: Optional[str] = None


class RentIncreaseResponse(BaseModel):
    id: str
    apartment_id: str
    apartment_code: Optional[str] = None
    apartment_name: Optional[str] = None
    tenant_user_id: Optional[str] = None
    tenant_user_name: Optional[str] = None
    tenant_name: str
    old_monthly_rent: float
    old_advance_payment: float
    new_monthly_rent: float
    new_advance_payment: float
    effective_date: str
    reason: Optional[str] = None
    status: str
    tenant_signed_at: Optional[str] = None
    pdf_filename: Optional[str] = None
    applied_to_tenancy: bool
    created_at: str

    model_config = {"from_attributes": True}


async def _enrich(notice: RentIncreaseNotice, db: AsyncSession) -> RentIncreaseResponse:
    apartment_code = None
    apartment_name = None
    tenant_user_name = None

    if notice.apartment_id:
        res = await db.execute(select(Apartment).where(Apartment.id == notice.apartment_id))
        apt = res.scalar_one_or_none()
        if apt:
            apartment_code = apt.code
            apartment_name = apt.name

    if notice.tenant_user_id:
        res = await db.execute(select(User).where(User.id == notice.tenant_user_id))
        u = res.scalar_one_or_none()
        if u:
            tenant_user_name = u.name

    return RentIncreaseResponse(
        id=notice.id,
        apartment_id=notice.apartment_id,
        apartment_code=apartment_code,
        apartment_name=apartment_name,
        tenant_user_id=notice.tenant_user_id,
        tenant_user_name=tenant_user_name,
        tenant_name=notice.tenant_name,
        old_monthly_rent=float(notice.old_monthly_rent),
        old_advance_payment=float(notice.old_advance_payment),
        new_monthly_rent=float(notice.new_monthly_rent),
        new_advance_payment=float(notice.new_advance_payment),
        effective_date=str(notice.effective_date),
        reason=notice.reason,
        status=notice.status if isinstance(notice.status, str) else notice.status.value,
        tenant_signed_at=notice.tenant_signed_at.isoformat() if notice.tenant_signed_at else None,
        pdf_filename=notice.pdf_filename,
        applied_to_tenancy=notice.applied_to_tenancy,
        created_at=notice.created_at.isoformat(),
    )


def _parse_date(date_str: str):
    from datetime import date
    return date.fromisoformat(date_str)


@router.get("", response_model=List[RentIncreaseResponse])
async def list_rent_increases(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    result = await db.execute(
        select(RentIncreaseNotice).order_by(RentIncreaseNotice.created_at.desc())
    )
    notices = result.scalars().all()
    return [await _enrich(n, db) for n in notices]


@router.post("", response_model=RentIncreaseResponse, status_code=201)
async def create_rent_increase(
    data: RentIncreaseCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    notice = RentIncreaseNotice(
        apartment_id=data.apartment_id,
        tenant_user_id=data.tenant_user_id if data.tenant_user_id else None,
        tenant_name=data.tenant_name,
        old_monthly_rent=data.old_monthly_rent,
        old_advance_payment=data.old_advance_payment,
        new_monthly_rent=data.new_monthly_rent,
        new_advance_payment=data.new_advance_payment,
        effective_date=_parse_date(data.effective_date),
        reason=data.reason,
        status=RentIncreaseStatus.DRAFT,
    )
    db.add(notice)
    await db.flush()
    result = await _enrich(notice, db)
    await db.commit()
    return result


@router.put("/{notice_id}", response_model=RentIncreaseResponse)
async def update_rent_increase(
    notice_id: str,
    data: RentIncreaseUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    result = await db.execute(select(RentIncreaseNotice).where(RentIncreaseNotice.id == notice_id))
    notice = result.scalar_one_or_none()
    if not notice:
        raise HTTPException(status_code=404, detail="Mieterhöhung nicht gefunden")
    if notice.status != RentIncreaseStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Nur Entwürfe können bearbeitet werden")

    update_data = data.model_dump(exclude_none=True)
    if "effective_date" in update_data:
        update_data["effective_date"] = _parse_date(update_data["effective_date"])
    if "tenant_user_id" in update_data and update_data["tenant_user_id"] == "":
        update_data["tenant_user_id"] = None

    for field, value in update_data.items():
        setattr(notice, field, value)

    enriched = await _enrich(notice, db)
    await db.commit()
    return enriched


@router.delete("/{notice_id}", status_code=204)
async def delete_rent_increase(
    notice_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    result = await db.execute(select(RentIncreaseNotice).where(RentIncreaseNotice.id == notice_id))
    notice = result.scalar_one_or_none()
    if not notice:
        raise HTTPException(status_code=404, detail="Mieterhöhung nicht gefunden")

    if notice.pdf_filename:
        pdf_path = os.path.join(settings.UPLOAD_DIR, notice.pdf_filename)
        if os.path.exists(pdf_path):
            os.remove(pdf_path)

    await db.delete(notice)
    await db.commit()


@router.post("/{notice_id}/send", response_model=RentIncreaseResponse)
async def send_rent_increase(
    notice_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    result = await db.execute(select(RentIncreaseNotice).where(RentIncreaseNotice.id == notice_id))
    notice = result.scalar_one_or_none()
    if not notice:
        raise HTTPException(status_code=404, detail="Mieterhöhung nicht gefunden")
    if notice.status != RentIncreaseStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Nur Entwürfe können gesendet werden")
    if not notice.tenant_user_id:
        raise HTTPException(
            status_code=400,
            detail="Kein Mieter-Login zugeordnet. Bitte zuerst einen Mieter-User auswählen."
        )

    notice.status = RentIncreaseStatus.SENT
    enriched = await _enrich(notice, db)
    await db.commit()
    return enriched


async def _generate_pdf_for_notice(notice: RentIncreaseNotice, db: AsyncSession) -> Optional[str]:
    """Helper: generate PDF and return filename or None on failure."""
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
        tenant_signature_b64=notice.tenant_signature,
        signed_at=notice.tenant_signed_at,
        signed_ip=notice.tenant_signed_ip,
    )
    return filename if success else None


@router.post("/{notice_id}/sign-direct", response_model=RentIncreaseResponse)
async def sign_direct(
    notice_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    """Admin signs directly in person. DRAFT or SENT → SIGNED, generates PDF."""
    result = await db.execute(select(RentIncreaseNotice).where(RentIncreaseNotice.id == notice_id))
    notice = result.scalar_one_or_none()
    if not notice:
        raise HTTPException(status_code=404, detail="Mieterhöhung nicht gefunden")
    if notice.status not in (RentIncreaseStatus.DRAFT, RentIncreaseStatus.SENT):
        raise HTTPException(status_code=400, detail="Mieterhöhung kann nicht mehr unterschrieben werden")

    signature_b64 = body.get("signature")
    if not signature_b64:
        raise HTTPException(status_code=400, detail="Unterschrift fehlt")

    notice.tenant_signature = signature_b64
    notice.tenant_signed_at = datetime.now(timezone.utc)
    notice.tenant_signed_ip = "Admin-Portal (vor Ort)"
    notice.status = RentIncreaseStatus.SIGNED

    filename = await _generate_pdf_for_notice(notice, db)
    if filename:
        notice.pdf_filename = filename

    enriched = await _enrich(notice, db)
    await db.commit()
    return enriched


@router.post("/{notice_id}/generate-pdf", response_model=RentIncreaseResponse)
async def generate_pdf(
    notice_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    result = await db.execute(select(RentIncreaseNotice).where(RentIncreaseNotice.id == notice_id))
    notice = result.scalar_one_or_none()
    if not notice:
        raise HTTPException(status_code=404, detail="Mieterhöhung nicht gefunden")

    filename = await _generate_pdf_for_notice(notice, db)
    if not filename:
        raise HTTPException(status_code=500, detail="PDF-Generierung fehlgeschlagen")

    notice.pdf_filename = filename
    enriched = await _enrich(notice, db)
    await db.commit()
    return enriched


@router.post("/{notice_id}/apply", response_model=RentIncreaseResponse)
async def apply_to_tenancy(
    notice_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    """Apply signed rent increase to tenancy: close old, create new period."""
    result = await db.execute(select(RentIncreaseNotice).where(RentIncreaseNotice.id == notice_id))
    notice = result.scalar_one_or_none()
    if not notice:
        raise HTTPException(status_code=404, detail="Mieterhöhung nicht gefunden")
    if notice.status != RentIncreaseStatus.SIGNED:
        raise HTTPException(status_code=400, detail="Mieterhöhung muss erst unterschrieben werden")
    if notice.applied_to_tenancy:
        raise HTTPException(status_code=400, detail="Mieterhöhung wurde bereits übernommen")

    effective = notice.effective_date
    if hasattr(effective, 'date'):
        effective = effective.date()

    # Find active tenancy for this apartment
    tenancy_result = await db.execute(
        select(Tenancy).where(
            and_(
                Tenancy.apartment_id == notice.apartment_id,
                or_(
                    Tenancy.end_date.is_(None),
                    Tenancy.end_date >= effective,
                )
            )
        ).order_by(Tenancy.start_date.desc())
    )
    active_tenancy = tenancy_result.scalars().first()

    if active_tenancy:
        # Close existing tenancy one day before effective date
        active_tenancy.end_date = effective - timedelta(days=1)
        reason_note = f"Beendet wegen Mieterhöhung ab {_fmt_date(effective)}"
        if notice.reason:
            reason_note += f" – {notice.reason}"
        active_tenancy.notes = (
            (active_tenancy.notes + "\n" if active_tenancy.notes else "") + reason_note
        )

    # Create new tenancy starting from effective_date
    from datetime import date
    new_tenancy = Tenancy(
        apartment_id=notice.apartment_id,
        tenant_id=notice.tenant_user_id if notice.tenant_user_id else (
            active_tenancy.tenant_id if active_tenancy else None
        ),
        start_date=effective,
        end_date=None,
        monthly_rent=notice.new_monthly_rent,
        monthly_advance_payment=notice.new_advance_payment,
        notes=f"Mieterhöhung ab {_fmt_date(effective)} (Schreiben vom {notice.created_at.strftime('%d.%m.%Y') if notice.created_at else '–'})",
    )

    if not new_tenancy.tenant_id:
        raise HTTPException(
            status_code=400,
            detail="Kein Mieter zugeordnet. Bitte Mieter-Login in der Mieterhöhung setzen."
        )

    db.add(new_tenancy)
    notice.applied_to_tenancy = True

    enriched = await _enrich(notice, db)
    await db.commit()
    return enriched


@router.get("/{notice_id}/pdf")
async def download_pdf(
    notice_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    result = await db.execute(select(RentIncreaseNotice).where(RentIncreaseNotice.id == notice_id))
    notice = result.scalar_one_or_none()
    if not notice or not notice.pdf_filename:
        raise HTTPException(status_code=404, detail="PDF nicht vorhanden")

    pdf_path = os.path.join(settings.UPLOAD_DIR, notice.pdf_filename)
    if not os.path.exists(pdf_path):
        raise HTTPException(status_code=404, detail="PDF-Datei nicht gefunden")

    return FileResponse(
        path=pdf_path,
        filename=f"Mieterhöhung_{notice.tenant_name}.pdf",
        media_type="application/pdf",
    )


def _fmt_date(d) -> str:
    if not d:
        return "–"
    try:
        return d.strftime("%d.%m.%Y")
    except Exception:
        return str(d)
