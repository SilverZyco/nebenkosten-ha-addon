from pydantic import BaseModel
from typing import Optional, Any, Dict, List
from datetime import datetime, date
from decimal import Decimal
from app.models.document import DocumentType, DocumentStatus


class BinAssignment(BaseModel):
    bin_id: str
    apartment_id: str


class DocumentUpdate(BaseModel):
    document_type: Optional[DocumentType] = None
    original_filename: Optional[str] = None
    invoice_date: Optional[date] = None
    service_period_from: Optional[date] = None
    service_period_to: Optional[date] = None
    total_amount: Optional[Decimal] = None
    supplier_name: Optional[str] = None
    invoice_number: Optional[str] = None
    bill_total_kwh: Optional[Decimal] = None
    rainwater_amount: Optional[Decimal] = None
    wastewater_amount: Optional[Decimal] = None
    is_billable: Optional[bool] = None
    is_visible_to_tenant: Optional[bool] = None
    year: Optional[int] = None
    notes: Optional[str] = None
    apartment_id: Optional[str] = None


class KIInboxConfirm(BaseModel):
    """Admin confirms/edits KI-extracted data."""
    document_type: Optional[DocumentType] = None
    original_filename: Optional[str] = None
    invoice_date: Optional[date] = None
    service_period_from: Optional[date] = None
    service_period_to: Optional[date] = None
    total_amount: Optional[Decimal] = None
    supplier_name: Optional[str] = None
    invoice_number: Optional[str] = None
    bill_total_kwh: Optional[Decimal] = None
    rainwater_amount: Optional[Decimal] = None
    wastewater_amount: Optional[Decimal] = None
    is_billable: Optional[bool] = None
    is_visible_to_tenant: Optional[bool] = None
    year: Optional[int] = None
    apartment_id: Optional[str] = None
    ai_json: Optional[Dict[str, Any]] = None
    bin_assignments: Optional[List[BinAssignment]] = None


class DocumentResponse(BaseModel):
    id: str
    filename: str
    original_filename: str
    document_type: DocumentType
    status: DocumentStatus
    upload_date: datetime
    uploaded_by: str
    year: Optional[int]
    invoice_date: Optional[date]
    service_period_from: Optional[date]
    service_period_to: Optional[date]
    total_amount: Optional[Decimal]
    supplier_name: Optional[str]
    invoice_number: Optional[str]
    bill_total_kwh: Optional[Decimal]
    rainwater_amount: Optional[Decimal]
    wastewater_amount: Optional[Decimal]
    is_billable: bool
    is_visible_to_tenant: bool
    ocr_text: Optional[str]
    ai_json: Optional[Dict[str, Any]]
    ai_notes: Optional[str]
    confirmed_by: Optional[str]
    confirmed_at: Optional[datetime]
    notes: Optional[str]
    apartment_id: Optional[str] = None
    uploader_name: Optional[str] = None

    class Config:
        from_attributes = True
