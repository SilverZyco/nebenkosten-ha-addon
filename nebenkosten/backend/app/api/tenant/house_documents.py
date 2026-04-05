"""Tenant portal – house document signing."""
import os
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.config import settings
from app.models.user import User
from app.models.apartment import Apartment
from app.models.house_document import HouseDocument, HouseDocumentStatus

router = APIRouter(prefix="/tenant/house-documents", tags=["tenant-house-documents"])

DOCUMENTS_DIR = os.environ.get("DOCUMENTS_DIR", "/app/dokumente")


def _apt_label(apt) -> str:
    if not apt:
        return "–"
    labels = {"EG": "Erdgeschoss", "OG": "Obergeschoss", "DG": "Dachgeschoss", "DU": "Büro"}
    return labels.get(apt.code, apt.name or apt.code or "–")


async def _doc_response(doc: HouseDocument, db: AsyncSession) -> dict:
    apt_label = "–"
    if doc.apartment_id:
        res = await db.execute(select(Apartment).where(Apartment.id == doc.apartment_id))
        apt = res.scalar_one_or_none()
        apt_label = _apt_label(apt)
    return {
        "id": doc.id,
        "template_filename": doc.template_filename,
        "title": doc.title,
        "document_text": doc.document_text or "",
        "apartment_label": apt_label,
        "tenant_name": doc.tenant_name,
        "status": doc.status if isinstance(doc.status, str) else doc.status.value,
        "tenant_signed_at": doc.tenant_signed_at.isoformat() if doc.tenant_signed_at else None,
        "has_pdf": bool(doc.pdf_filename),
        "created_at": doc.created_at.isoformat(),
    }


@router.get("")
async def list_tenant_house_documents(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(HouseDocument)
        .where(
            HouseDocument.tenant_user_id == current_user.id,
            HouseDocument.status.in_([HouseDocumentStatus.SENT, HouseDocumentStatus.SIGNED]),
        )
        .order_by(HouseDocument.created_at.desc())
    )
    docs = result.scalars().all()
    return [await _doc_response(d, db) for d in docs]


@router.post("/{doc_id}/sign")
async def sign_house_document(
    doc_id: str,
    body: dict,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(HouseDocument).where(HouseDocument.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Dokument nicht gefunden")
    if doc.status != HouseDocumentStatus.SENT:
        raise HTTPException(status_code=400, detail="Dokument ist nicht zur Unterschrift freigegeben")
    if doc.tenant_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Kein Zugriff")

    signature_b64 = body.get("signature")
    if not signature_b64:
        raise HTTPException(status_code=400, detail="Unterschrift fehlt")

    updated_text = body.get("document_text")
    if updated_text:
        doc.document_text = updated_text

    client_ip = request.headers.get("X-Forwarded-For", request.client.host if request.client else "unknown")

    doc.tenant_signature = signature_b64
    doc.tenant_signed_at = datetime.now(timezone.utc)
    doc.tenant_signed_ip = client_ip
    doc.status = HouseDocumentStatus.SIGNED

    apt_label = "–"
    if doc.apartment_id:
        apt_res = await db.execute(select(Apartment).where(Apartment.id == doc.apartment_id))
        apt = apt_res.scalar_one_or_none()
        apt_label = _apt_label(apt)

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    filename = f"hausunterlage_{doc.id}.pdf"
    output_path = os.path.join(settings.UPLOAD_DIR, filename)

    from app.services.house_document_pdf import generate_house_document_pdf
    success = generate_house_document_pdf(
        output_path=output_path,
        title=doc.title,
        template_filename=doc.template_filename,
        tenant_name=doc.tenant_name or "-",
        apartment_label=apt_label,
        document_text=doc.document_text or "",
        tenant_signature_b64=signature_b64,
        tenant_signed_at=doc.tenant_signed_at,
        tenant_signed_ip=client_ip,
    )
    if success:
        doc.pdf_filename = filename

    await db.commit()
    return await _doc_response(doc, db)


@router.get("/{doc_id}/pdf")
async def tenant_download_pdf(
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(HouseDocument).where(HouseDocument.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc or doc.status != HouseDocumentStatus.SIGNED:
        raise HTTPException(status_code=404, detail="Unterzeichnetes Dokument nicht gefunden")
    if doc.tenant_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Kein Zugriff")
    if not doc.pdf_filename:
        raise HTTPException(status_code=404, detail="PDF noch nicht vorhanden")
    pdf_path = os.path.join(settings.UPLOAD_DIR, doc.pdf_filename)
    if not os.path.exists(pdf_path):
        raise HTTPException(status_code=404, detail="PDF-Datei nicht gefunden")
    return FileResponse(
        path=pdf_path,
        filename=f"Hausunterlage_{doc.title}.pdf",
        media_type="application/pdf",
    )


@router.get("/{doc_id}/odt")
async def tenant_download_odt(
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Download the original ODT template file."""
    result = await db.execute(select(HouseDocument).where(HouseDocument.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Dokument nicht gefunden")
    if doc.tenant_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Kein Zugriff")
    if doc.status not in (HouseDocumentStatus.SENT, HouseDocumentStatus.SIGNED):
        raise HTTPException(status_code=403, detail="Kein Zugriff")

    fname = doc.template_filename
    if "/" in fname or "\\" in fname or ".." in fname:
        raise HTTPException(status_code=400, detail="Ungültiger Dateiname")

    path = os.path.join(DOCUMENTS_DIR, fname)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Originaldatei nicht gefunden")

    return FileResponse(path=path, filename=fname, media_type="application/vnd.oasis.opendocument.text")
