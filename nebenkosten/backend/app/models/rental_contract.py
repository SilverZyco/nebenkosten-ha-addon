import uuid
from datetime import datetime, timezone
from decimal import Decimal
from enum import Enum as PyEnum
from sqlalchemy import String, DateTime, Date, Numeric, ForeignKey, Text, Enum, Boolean, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class RentalContractStatus(str, PyEnum):
    DRAFT = "draft"    # Admin füllt aus
    SENT = "sent"      # An Mieter gesendet / wartet auf Unterschrift
    SIGNED = "signed"  # Mieter hat unterschrieben, PDF vorhanden


class RentalContract(Base):
    __tablename__ = "rental_contracts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))

    # Wohnungszuordnung
    apartment_id: Mapped[str] = mapped_column(String(36), ForeignKey("apartments.id"), nullable=False, index=True)
    tenancy_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenancies.id"), nullable=True)

    # Direkter Mieter-User (unabhängig vom Mietverhältnis)
    tenant_user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True, index=True)

    # Mieterdaten (manuell / aus Mietverhältnis)
    tenant_name: Mapped[str] = mapped_column(String(500), nullable=False)
    tenant_address1: Mapped[str] = mapped_column(String(200), nullable=True)
    tenant_address2: Mapped[str] = mapped_column(String(200), nullable=True)
    tenant_address3: Mapped[str] = mapped_column(String(200), nullable=True)

    # Vertragsdaten
    start_date: Mapped[datetime] = mapped_column(Date, nullable=False)
    monthly_rent: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    advance_payment: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    kitchen_fee: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=True)
    deposit: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    special_notes: Mapped[str] = mapped_column(Text, nullable=True)

    # Status
    status: Mapped[RentalContractStatus] = mapped_column(
        Enum(RentalContractStatus, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        default=RentalContractStatus.DRAFT,
    )

    # Unterschrift (base64-PNG)
    tenant_signature: Mapped[str] = mapped_column(Text, nullable=True)
    tenant_signed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    tenant_signed_ip: Mapped[str] = mapped_column(String(100), nullable=True)

    # Bearbeitbare Vertragsabschnitte (JSON)
    contract_paragraphs: Mapped[str] = mapped_column(Text, nullable=True)

    # Vermieter-Unterschrift (base64-PNG)
    landlord_signature: Mapped[str] = mapped_column(Text, nullable=True)
    landlord_signed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)

    # Optionen
    has_cellar: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    deposit_months: Mapped[int] = mapped_column(Integer, nullable=False, default=3)

    # Generiertes PDF
    pdf_filename: Mapped[str] = mapped_column(String(500), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    apartment: Mapped["Apartment"] = relationship()
    tenancy: Mapped["Tenancy"] = relationship()
    tenant_user: Mapped["User"] = relationship(foreign_keys=[tenant_user_id])
