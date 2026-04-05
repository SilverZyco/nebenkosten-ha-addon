"""KI-Inbox: Admin reviews AI-extracted document data before booking."""
from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.deps import get_current_admin
from app.models.user import User
from app.models.document import Document, DocumentStatus, DEFAULT_BILLABLE, DocumentType
from app.models.apartment import WasteBinMapping
from app.schemas.document import DocumentResponse, KIInboxConfirm
from app.services.audit_service import log_action

router = APIRouter(prefix="/ki-inbox", tags=["admin-ki-inbox"])


@router.get("", response_model=List[DocumentResponse])
async def list_ki_inbox(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    """List all documents pending admin review (AI extracted or OCR done)."""
    result = await db.execute(
        select(Document)
        .where(Document.status.in_([
            DocumentStatus.AI_EXTRACTED,
            DocumentStatus.OCR_DONE,
            DocumentStatus.OCR_PROCESSING,
            DocumentStatus.AI_PROCESSING,
        ]))
        .order_by(Document.upload_date.desc())
    )
    return result.scalars().all()


@router.get("/count")
async def ki_inbox_count(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    """Get count of pending KI inbox items."""
    from sqlalchemy import func
    result = await db.execute(
        select(func.count()).where(Document.status.in_([
            DocumentStatus.AI_EXTRACTED,
            DocumentStatus.OCR_DONE,
        ]))
    )
    count = result.scalar()
    return {"count": count}


@router.get("/{doc_id}", response_model=DocumentResponse)
async def get_ki_item(
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Dokument nicht gefunden")
    return doc


@router.post("/{doc_id}/confirm", response_model=DocumentResponse)
async def confirm_ki_data(
    doc_id: str,
    data: KIInboxConfirm,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    """
    Admin confirms (and optionally edits) the AI-extracted data.
    This books the document into the system.
    """
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Dokument nicht gefunden")

    # Apply confirmed/edited data
    update_data = data.model_dump(exclude_none=True)

    # Extract bin_assignments before applying to document fields
    bin_assignments = update_data.pop("bin_assignments", None)

    # Handle document_type change with default billable update
    if "document_type" in update_data:
        doc.document_type = update_data.pop("document_type")
        # Reset defaults based on new type
        if "is_billable" not in update_data:
            doc.is_billable = DEFAULT_BILLABLE.get(doc.document_type, False)
        if "is_visible_to_tenant" not in update_data:
            doc.is_visible_to_tenant = doc.is_billable

    for field, value in update_data.items():
        setattr(doc, field, value)

    doc.status = DocumentStatus.CONFIRMED
    doc.confirmed_by = current_user.id
    doc.confirmed_at = datetime.now(timezone.utc)

    # Save bin → apartment assignments
    if bin_assignments:
        from datetime import date
        for assignment in bin_assignments:
            raw_bin_id = assignment["bin_id"]
            bin_id = raw_bin_id.lstrip("0") or raw_bin_id  # Normalize: "0000312864" → "312864"
            apartment_id = assignment["apartment_id"]
            # Only create if not already exists for this bin_id + apartment_id
            existing = await db.execute(
                select(WasteBinMapping).where(
                    WasteBinMapping.bin_id == bin_id,
                    WasteBinMapping.apartment_id == apartment_id,
                )
            )
            if not existing.scalar_one_or_none():
                mapping = WasteBinMapping(
                    bin_id=bin_id,
                    apartment_id=apartment_id,
                    valid_from=date.today(),
                )
                db.add(mapping)

    await log_action(
        db, "KI_CONFIRM",
        user_id=current_user.id,
        entity_type="document",
        entity_id=doc_id,
        details={"confirmed_fields": list(update_data.keys())}
    )
    return doc


@router.post("/{doc_id}/reject", response_model=DocumentResponse)
async def reject_ki_data(
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    """Admin rejects the AI-extracted data (marks for manual entry)."""
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Dokument nicht gefunden")

    doc.status = DocumentStatus.REJECTED
    doc.confirmed_by = current_user.id
    doc.confirmed_at = datetime.now(timezone.utc)

    await log_action(
        db, "KI_REJECT",
        user_id=current_user.id,
        entity_type="document",
        entity_id=doc_id,
    )
    return doc


@router.post("/{doc_id}/reprocess")
async def reprocess_document(
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    """Re-trigger OCR/AI processing for a document."""
    import asyncio
    from app.core.config import settings
    import os
    from app.api.admin.documents import _process_document

    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Dokument nicht gefunden")

    doc.status = DocumentStatus.UPLOADED
    doc.ocr_text = None
    doc.ai_json = None
    await db.commit()

    file_path = os.path.join(settings.UPLOAD_DIR, doc.filename)
    asyncio.create_task(_process_document(doc_id, file_path, doc.original_filename))

    return {"message": "Verarbeitung neu gestartet"}
