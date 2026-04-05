import uuid
from datetime import datetime, timezone
from enum import Enum as PyEnum
from sqlalchemy import String, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class HouseDocumentStatus(str, PyEnum):
    DRAFT = "draft"    # Admin hat zugewiesen, noch nicht gesendet
    SENT = "sent"      # An Mieter gesendet / wartet auf Unterschrift
    SIGNED = "signed"  # Mieter hat unterschrieben, PDF vorhanden


class HouseDocument(Base):
    __tablename__ = "house_documents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))

    # Template reference (filename in dokumente dir, e.g. "Hausordnung.odt")
    template_filename: Mapped[str] = mapped_column(String(500), nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)

    # Assignment
    apartment_id: Mapped[str] = mapped_column(String(36), ForeignKey("apartments.id"), nullable=True)
    tenant_user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    tenant_name: Mapped[str] = mapped_column(String(500), nullable=True)

    # Status (stored as string to avoid creating PG enum type)
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=HouseDocumentStatus.DRAFT.value,
    )

    # Tenant signature (base64-PNG)
    tenant_signature: Mapped[str] = mapped_column(Text, nullable=True)
    tenant_signed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    tenant_signed_ip: Mapped[str] = mapped_column(String(100), nullable=True)

    # Landlord signature (base64-PNG)
    landlord_signature: Mapped[str] = mapped_column(Text, nullable=True)
    landlord_signed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)

    # Editable document text (shown to tenant before signing)
    document_text: Mapped[str] = mapped_column(Text, nullable=True)

    # Generated PDF
    pdf_filename: Mapped[str] = mapped_column(String(500), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    apartment: Mapped["Apartment"] = relationship()
    tenant_user: Mapped["User"] = relationship(foreign_keys=[tenant_user_id])
