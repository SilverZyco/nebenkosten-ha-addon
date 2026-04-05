"""Tenant portal - read-only document access."""
import os
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.config import settings
from app.models.user import User
from app.models.document import Document, DocumentStatus
from app.models.tenancy import Tenancy

router = APIRouter(prefix="/tenant/documents", tags=["tenant-documents"])


async def _get_tenant_apartment_id(db: AsyncSession, user_id: str) -> Optional[str]:
    """Get the apartment_id for the current active tenancy of the user."""
    result = await db.execute(
        select(Tenancy)
        .where(Tenancy.tenant_id == user_id, Tenancy.end_date.is_(None))
        .limit(1)
    )
    tenancy = result.scalar_one_or_none()
    return tenancy.apartment_id if tenancy else None


@router.get("")
async def list_tenant_documents(
    year: Optional[int] = Query(None),
    document_type: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List visible documents for this tenant.
    Shows:
    - Global documents (no apartment_id) that are visible to tenant
    - Documents assigned to the tenant's own apartment
    """
    apartment_id = await _get_tenant_apartment_id(db, current_user.id)

    query = (
        select(Document)
        .where(
            Document.is_visible_to_tenant == True,
            Document.status.in_([DocumentStatus.CONFIRMED, DocumentStatus.UPLOADED]),
            # Show global docs OR docs assigned to this tenant's apartment
            or_(
                Document.apartment_id.is_(None),
                Document.apartment_id == apartment_id if apartment_id else Document.apartment_id.is_(None),
            )
        )
        .order_by(Document.upload_date.desc())
    )
    if year:
        query = query.where(Document.year == year)
    if document_type:
        query = query.where(Document.document_type == document_type)

    result = await db.execute(query)
    docs = result.scalars().all()

    return [
        {
            "id": d.id,
            "original_filename": d.original_filename,
            "document_type": d.document_type,
            "year": d.year,
            "invoice_date": str(d.invoice_date) if d.invoice_date else None,
            "service_period_from": str(d.service_period_from) if d.service_period_from else None,
            "service_period_to": str(d.service_period_to) if d.service_period_to else None,
            "supplier_name": d.supplier_name,
            "upload_date": d.upload_date.isoformat(),
        }
        for d in docs
    ]


@router.get("/{doc_id}/download")
async def download_document(
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()

    if not doc or not doc.is_visible_to_tenant:
        raise HTTPException(status_code=404, detail="Dokument nicht gefunden")

    # If document is apartment-specific, check tenant belongs to that apartment
    if doc.apartment_id:
        apartment_id = await _get_tenant_apartment_id(db, current_user.id)
        if doc.apartment_id != apartment_id:
            raise HTTPException(status_code=403, detail="Kein Zugriff auf dieses Dokument")

    file_path = os.path.join(settings.UPLOAD_DIR, doc.filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Datei nicht gefunden")

    return FileResponse(
        path=file_path,
        filename=doc.original_filename,
        media_type="application/pdf",
    )
