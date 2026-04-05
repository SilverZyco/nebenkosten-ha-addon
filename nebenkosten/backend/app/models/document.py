import uuid
from datetime import datetime, date, timezone
from decimal import Decimal
from enum import Enum as PyEnum
from sqlalchemy import String, Boolean, DateTime, Date, Numeric, ForeignKey, Text, JSON, Enum, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class DocumentType(str, PyEnum):
    WATER_INVOICE = "water_invoice"
    GAS_INVOICE = "gas_invoice"
    WASTE_INVOICE_EVS = "waste_invoice_evs"
    MAINTENANCE_INVOICE = "maintenance_invoice"
    CHIMNEY_SWEEP_INVOICE = "chimney_sweep_invoice"
    ELECTRICITY_COMMON_INVOICE = "electricity_common_invoice"
    RAINWATER_FEE_INVOICE = "rainwater_fee_invoice"
    PROPERTY_TAX_NOTICE = "property_tax_notice"
    INSURANCE_INVOICE = "insurance_invoice"
    CONTRACT = "contract"
    METER_READING = "meter_reading"
    HANDOVER_PROTOCOL = "handover_protocol"
    HOUSE_RULES = "house_rules"
    INSTRUCTION = "instruction"                    # Belehrung (z.B. Rauchwarnmelder, DSGVO)
    ANCILLARY_COSTS_NOTICE = "ancillary_costs_notice"  # Nebenkostenankündigung / Vorauszahlung
    OTHER = "other"


class DocumentStatus(str, PyEnum):
    UPLOADED = "uploaded"          # Fresh upload, not yet processed
    OCR_PROCESSING = "ocr_processing"
    OCR_DONE = "ocr_done"          # OCR text extracted
    AI_PROCESSING = "ai_processing"
    AI_EXTRACTED = "ai_extracted"  # KI has extracted data, waiting for admin review
    CONFIRMED = "confirmed"        # Admin confirmed KI data
    REJECTED = "rejected"          # Admin rejected KI data


# Document type label mapping (German)
DOCUMENT_TYPE_LABELS = {
    DocumentType.WATER_INVOICE: "Wasserrechnung",
    DocumentType.GAS_INVOICE: "Gasrechnung",
    DocumentType.WASTE_INVOICE_EVS: "Müll/EVS-Rechnung",
    DocumentType.MAINTENANCE_INVOICE: "Wartungsrechnung",
    DocumentType.CHIMNEY_SWEEP_INVOICE: "Schornsteinfeger",
    DocumentType.ELECTRICITY_COMMON_INVOICE: "Allgemeinstrom",
    DocumentType.RAINWATER_FEE_INVOICE: "Niederschlagswasser",
    DocumentType.PROPERTY_TAX_NOTICE: "Grundsteuerbescheid",
    DocumentType.INSURANCE_INVOICE: "Gebäudeversicherung",
    DocumentType.CONTRACT: "Mietvertrag",
    DocumentType.METER_READING: "Ableseprotokoll",
    DocumentType.HANDOVER_PROTOCOL: "Übergabeprotokoll",
    DocumentType.HOUSE_RULES: "Hausordnung",
    DocumentType.INSTRUCTION: "Belehrung",
    DocumentType.ANCILLARY_COSTS_NOTICE: "Nebenkostenankündigung",
    DocumentType.OTHER: "Sonstiges",
}

# Default billable status by document type
DEFAULT_BILLABLE = {
    DocumentType.WATER_INVOICE: True,
    DocumentType.GAS_INVOICE: True,
    DocumentType.WASTE_INVOICE_EVS: True,
    DocumentType.MAINTENANCE_INVOICE: True,
    DocumentType.CHIMNEY_SWEEP_INVOICE: True,
    DocumentType.ELECTRICITY_COMMON_INVOICE: True,
    DocumentType.RAINWATER_FEE_INVOICE: True,
    DocumentType.PROPERTY_TAX_NOTICE: True,
    DocumentType.INSURANCE_INVOICE: True,
    DocumentType.CONTRACT: False,
    DocumentType.METER_READING: False,
    DocumentType.HANDOVER_PROTOCOL: False,
    DocumentType.HOUSE_RULES: False,
    DocumentType.INSTRUCTION: False,
    DocumentType.ANCILLARY_COSTS_NOTICE: False,
    DocumentType.OTHER: False,
}


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    filename: Mapped[str] = mapped_column(String(500), nullable=False)  # stored on disk
    original_filename: Mapped[str] = mapped_column(String(500), nullable=False)
    document_type: Mapped[DocumentType] = mapped_column(Enum(DocumentType, values_callable=lambda x: [e.value for e in x]), nullable=False, default=DocumentType.OTHER)
    status: Mapped[DocumentStatus] = mapped_column(Enum(DocumentStatus, values_callable=lambda x: [e.value for e in x]), nullable=False, default=DocumentStatus.UPLOADED)

    # Metadata
    upload_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        default=lambda: datetime.now(timezone.utc)
    )
    uploaded_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=True, index=True)
    invoice_date: Mapped[date] = mapped_column(Date, nullable=True)
    service_period_from: Mapped[date] = mapped_column(Date, nullable=True)
    service_period_to: Mapped[date] = mapped_column(Date, nullable=True)

    # Financial
    total_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=True)
    supplier_name: Mapped[str] = mapped_column(String(500), nullable=True)
    invoice_number: Mapped[str] = mapped_column(String(200), nullable=True)

    # Gas specific
    bill_total_kwh: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=True)

    # Rainwater fee embedded in water invoice
    rainwater_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=True)

    # Wastewater (Schmutzwasser) fee embedded in water invoice (KDÜ)
    wastewater_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=True)

    # Assignment to a specific apartment (for tenant-specific documents like Belehrungen, Mietvertrag)
    apartment_id: Mapped[str] = mapped_column(String(36), ForeignKey("apartments.id"), nullable=True, index=True)

    # Visibility and billing flags
    is_billable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_visible_to_tenant: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # OCR and AI extraction
    ocr_text: Mapped[str] = mapped_column(Text, nullable=True)
    ai_json: Mapped[dict] = mapped_column(JSON, nullable=True)
    ai_notes: Mapped[str] = mapped_column(Text, nullable=True)

    # Admin review
    confirmed_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    confirmed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)

    # Notes
    notes: Mapped[str] = mapped_column(Text, nullable=True)

    # Relationships
    uploader: Mapped["User"] = relationship(foreign_keys=[uploaded_by])
    confirmer: Mapped["User"] = relationship(foreign_keys=[confirmed_by])
