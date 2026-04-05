import os
import uuid
import asyncio
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks, Query
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from app.core.database import get_db
from app.core.deps import get_current_admin, get_current_user
from app.core.config import settings
from app.models.user import User
from app.models.document import Document, DocumentType, DocumentStatus, DEFAULT_BILLABLE
from app.schemas.document import DocumentUpdate, DocumentResponse
from app.services.audit_service import log_action
from app.services.ocr_service import extract_text_from_pdf, extract_text_from_image
from app.services.ai_extraction import extract_document_data, extract_document_data_vision

router = APIRouter(prefix="/documents", tags=["admin-documents"])


IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".tif", ".tiff"}


def _apply_ai_data(doc: "Document", ai_data: dict) -> None:
    """Apply extracted AI data onto the document model (in-place)."""
    from decimal import Decimal
    from datetime import date

    if ai_data.get("document_type"):
        try:
            doc.document_type = DocumentType(ai_data["document_type"])
            doc.is_billable = DEFAULT_BILLABLE.get(doc.document_type, False)
            doc.is_visible_to_tenant = doc.is_billable
        except Exception:
            pass
    if ai_data.get("supplier_name") and not doc.supplier_name:
        doc.supplier_name = ai_data["supplier_name"]
    if ai_data.get("total_amount") and not doc.total_amount:
        doc.total_amount = Decimal(str(ai_data["total_amount"]))
    if ai_data.get("invoice_number") and not doc.invoice_number:
        doc.invoice_number = ai_data["invoice_number"]
    if ai_data.get("bill_total_kwh") and not doc.bill_total_kwh:
        doc.bill_total_kwh = Decimal(str(ai_data["bill_total_kwh"]))
    if ai_data.get("rainwater_amount") and not doc.rainwater_amount:
        doc.rainwater_amount = Decimal(str(ai_data["rainwater_amount"]))
    if ai_data.get("wastewater_amount") and not doc.wastewater_amount:
        doc.wastewater_amount = Decimal(str(ai_data["wastewater_amount"]))
    for date_field in ("invoice_date", "service_period_from", "service_period_to"):
        if ai_data.get(date_field) and not getattr(doc, date_field):
            try:
                setattr(doc, date_field, date.fromisoformat(ai_data[date_field]))
            except Exception:
                pass


async def _process_document(doc_id: str, file_path: str, original_filename: str):
    """Background task: run OCR + AI extraction."""
    import logging as _logging
    _logger = _logging.getLogger(__name__)

    from app.core.database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        try:
            result = await db.execute(select(Document).where(Document.id == doc_id))
            doc = result.scalar_one_or_none()
            if not doc:
                return

            ext = os.path.splitext(file_path)[1].lower()
            is_image = ext in IMAGE_EXTENSIONS

            # ── Image files: use GPT-4o Vision directly ──────────
            if is_image and settings.AI_ENABLED and settings.OPENAI_API_KEY:
                doc.status = DocumentStatus.AI_PROCESSING
                await db.commit()

                ai_data = await extract_document_data_vision(file_path, original_filename)
                if ai_data:
                    doc.ai_json = ai_data
                    doc.status = DocumentStatus.AI_EXTRACTED
                    _apply_ai_data(doc, ai_data)
                else:
                    # Vision failed – fall back to image OCR
                    if settings.OCR_ENABLED:
                        doc.status = DocumentStatus.OCR_PROCESSING
                        await db.commit()
                        ocr_text = await extract_text_from_image(file_path)
                        if ocr_text:
                            doc.ocr_text = ocr_text
                        doc.status = DocumentStatus.OCR_DONE
                await db.commit()
                return

            # ── PDF files: Tesseract OCR → GPT text extraction ───
            if settings.OCR_ENABLED:
                doc.status = DocumentStatus.OCR_PROCESSING
                await db.commit()

                ocr_text = await extract_text_from_pdf(file_path)
                if ocr_text:
                    doc.ocr_text = ocr_text
                    doc.status = DocumentStatus.OCR_DONE
                    await db.commit()

                    if settings.AI_ENABLED and settings.OPENAI_API_KEY:
                        doc.status = DocumentStatus.AI_PROCESSING
                        await db.commit()

                        ai_data = await extract_document_data(ocr_text, original_filename)
                        if ai_data:
                            doc.ai_json = ai_data
                            doc.status = DocumentStatus.AI_EXTRACTED
                            _apply_ai_data(doc, ai_data)
                        else:
                            doc.status = DocumentStatus.OCR_DONE
                        await db.commit()
                else:
                    # OCR yielded nothing
                    doc.status = DocumentStatus.OCR_DONE
                    await db.commit()

        except Exception as e:
            _logger.error(f"Document processing failed: {e}")


@router.post("/upload", response_model=DocumentResponse, status_code=201)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    document_type: Optional[str] = Form(None),
    year: Optional[int] = Form(None),
    notes: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    if file.size and file.size > settings.max_upload_bytes:
        raise HTTPException(status_code=413, detail=f"Datei zu groß (max {settings.MAX_UPLOAD_SIZE_MB}MB)")

    # Store file
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in (".pdf", ".png", ".jpg", ".jpeg", ".tif", ".tiff"):
        raise HTTPException(status_code=400, detail="Nur PDF und Bilder erlaubt")

    stored_name = f"{uuid.uuid4()}{ext}"
    file_path = os.path.join(settings.UPLOAD_DIR, stored_name)
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    # Determine default document type
    doc_type = DocumentType.OTHER
    if document_type:
        try:
            doc_type = DocumentType(document_type)
        except ValueError:
            pass

    is_billable = DEFAULT_BILLABLE.get(doc_type, False)

    doc = Document(
        filename=stored_name,
        original_filename=file.filename or stored_name,
        document_type=doc_type,
        status=DocumentStatus.UPLOADED,
        uploaded_by=current_user.id,
        year=year,
        is_billable=is_billable,
        is_visible_to_tenant=is_billable,
        notes=notes,
    )
    db.add(doc)
    await db.flush()

    await log_action(
        db, "DOCUMENT_UPLOAD",
        user_id=current_user.id,
        entity_type="document",
        entity_id=doc.id,
        details={"filename": file.filename, "type": doc_type}
    )

    # Start background OCR/AI processing
    background_tasks.add_task(_process_document, doc.id, file_path, file.filename or "")

    return doc


@router.post("/manual", response_model=DocumentResponse, status_code=201)
async def create_manual_document(
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    """
    Create a document entry without a file (manual entry).
    Used for e.g. Grundsteuerbescheid entered manually.
    """
    from decimal import Decimal
    from datetime import date

    doc_type = DocumentType.OTHER
    if data.get("document_type"):
        try:
            doc_type = DocumentType(data["document_type"])
        except ValueError:
            pass

    is_billable = DEFAULT_BILLABLE.get(doc_type, True)

    doc = Document(
        filename="manual_entry",
        original_filename=data.get("original_filename") or f"{doc_type.value}_{data.get('year', '')}",
        document_type=doc_type,
        status=DocumentStatus.CONFIRMED,
        uploaded_by=current_user.id,
        year=data.get("year"),
        is_billable=data.get("is_billable", is_billable),
        is_visible_to_tenant=data.get("is_visible_to_tenant", False),
        notes=data.get("notes"),
        supplier_name=data.get("supplier_name"),
        invoice_number=data.get("invoice_number"),
    )
    if data.get("total_amount"):
        doc.total_amount = Decimal(str(data["total_amount"]))
    if data.get("invoice_date"):
        try:
            doc.invoice_date = date.fromisoformat(str(data["invoice_date"]))
        except Exception:
            pass
    if data.get("service_period_from"):
        try:
            doc.service_period_from = date.fromisoformat(str(data["service_period_from"]))
        except Exception:
            pass
    if data.get("service_period_to"):
        try:
            doc.service_period_to = date.fromisoformat(str(data["service_period_to"]))
        except Exception:
            pass
    if data.get("apartment_id"):
        doc.apartment_id = data["apartment_id"]

    db.add(doc)
    await db.flush()

    await log_action(
        db, "DOCUMENT_MANUAL",
        user_id=current_user.id,
        entity_type="document",
        entity_id=doc.id,
        details={"type": doc_type, "amount": str(doc.total_amount)}
    )

    return doc


@router.get("", response_model=List[DocumentResponse])
async def list_documents(
    year: Optional[int] = Query(None),
    document_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    query = select(Document).order_by(Document.upload_date.desc())
    if year:
        query = query.where(Document.year == year)
    if document_type:
        query = query.where(Document.document_type == document_type)
    if status:
        query = query.where(Document.status == status)
    if search:
        query = query.where(
            or_(
                Document.original_filename.ilike(f"%{search}%"),
                Document.supplier_name.ilike(f"%{search}%"),
                Document.invoice_number.ilike(f"%{search}%"),
            )
        )

    result = await db.execute(query)
    docs = result.scalars().all()

    # Enrich with uploader name
    from sqlalchemy import select as sel
    from app.models.user import User as UserModel
    responses = []
    for d in docs:
        r = DocumentResponse.model_validate(d)
        if d.uploaded_by:
            u_result = await db.execute(sel(UserModel).where(UserModel.id == d.uploaded_by))
            u = u_result.scalar_one_or_none()
            r.uploader_name = u.name if u else None
        responses.append(r)
    return responses


@router.get("/{doc_id}", response_model=DocumentResponse)
async def get_document(
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Dokument nicht gefunden")
    return doc


@router.put("/{doc_id}", response_model=DocumentResponse)
async def update_document(
    doc_id: str,
    data: DocumentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Dokument nicht gefunden")

    update_data = data.model_dump(exclude_none=True)
    for field, value in update_data.items():
        setattr(doc, field, value)

    await log_action(db, "DOCUMENT_UPDATE", user_id=current_user.id, entity_type="document", entity_id=doc_id)
    return doc


@router.delete("/{doc_id}", status_code=204)
async def delete_document(
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Dokument nicht gefunden")

    # Delete file (skip for manual entries)
    if doc.filename != "manual_entry":
        file_path = os.path.join(settings.UPLOAD_DIR, doc.filename)
        if os.path.exists(file_path):
            os.remove(file_path)

    await log_action(db, "DOCUMENT_DELETE", user_id=current_user.id, entity_type="document", entity_id=doc_id)
    await db.delete(doc)


@router.get("/{doc_id}/download")
async def download_document(
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Authenticated file download - never expose direct paths."""
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Dokument nicht gefunden")

    # Tenants can only download visible documents
    from app.models.user import UserRole
    if current_user.role == UserRole.TENANT and not doc.is_visible_to_tenant:
        raise HTTPException(status_code=403, detail="Kein Zugriff")

    # Manual entries have no file
    if doc.filename == "manual_entry":
        raise HTTPException(status_code=404, detail="Dieses Dokument wurde manuell erfasst – keine Datei vorhanden")

    file_path = os.path.join(settings.UPLOAD_DIR, doc.filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Datei nicht gefunden")

    ext = os.path.splitext(doc.filename)[1].lower()
    media_type_map = {
        ".pdf": "application/pdf",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".tif": "image/tiff",
        ".tiff": "image/tiff",
    }
    return FileResponse(
        path=file_path,
        filename=doc.original_filename,
        media_type=media_type_map.get(ext, "application/octet-stream"),
    )
