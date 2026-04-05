import uuid
from datetime import datetime, timezone, date
from decimal import Decimal
from enum import Enum as PyEnum
from sqlalchemy import String, Boolean, DateTime, Date, Numeric, ForeignKey, Text, JSON, Enum, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class BillingStatus(str, PyEnum):
    DRAFT = "draft"
    CALCULATED = "calculated"
    FINALIZED = "finalized"
    SENT = "sent"


class BillingPeriod(Base):
    """Represents a billing year with all cost calculations."""
    __tablename__ = "billing_periods"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    year: Mapped[int] = mapped_column(Integer, nullable=False, unique=True, index=True)
    status: Mapped[BillingStatus] = mapped_column(Enum(BillingStatus, values_callable=lambda x: [e.value for e in x]), nullable=False, default=BillingStatus.DRAFT)
    calculation_data: Mapped[dict] = mapped_column(JSON, nullable=True)  # Full calculation details for audit
    warnings: Mapped[list] = mapped_column(JSON, nullable=True, default=list)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    finalized_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    generated_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        default=lambda: datetime.now(timezone.utc)
    )

    apartment_billings: Mapped[list["ApartmentBilling"]] = relationship(back_populates="billing_period")
    generator: Mapped["User"] = relationship()


class ApartmentBilling(Base):
    """Per-apartment billing for a billing period."""
    __tablename__ = "apartment_billings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    billing_period_id: Mapped[str] = mapped_column(String(36), ForeignKey("billing_periods.id"), nullable=False)
    apartment_id: Mapped[str] = mapped_column(String(36), ForeignKey("apartments.id"), nullable=False)
    tenancy_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenancies.id"), nullable=True)
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)

    calculation_details: Mapped[dict] = mapped_column(JSON, nullable=True)
    cost_breakdown: Mapped[dict] = mapped_column(JSON, nullable=True)  # Detailed line items

    total_costs: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    advance_payments: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    balance: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)  # + = Nachzahlung, - = Erstattung

    # PDF
    pdf_filename: Mapped[str] = mapped_column(String(500), nullable=True)
    pdf_generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)

    # Receipt / Quittung
    receipt_filename: Mapped[str] = mapped_column(String(500), nullable=True)
    receipt_generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    receipt_payment_method: Mapped[str] = mapped_column(String(50), nullable=True)
    receipt_payment_date: Mapped[date] = mapped_column(Date, nullable=True)

    # Release to tenant
    is_released: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    released_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    released_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        default=lambda: datetime.now(timezone.utc)
    )

    billing_period: Mapped["BillingPeriod"] = relationship(back_populates="apartment_billings")
    apartment: Mapped["Apartment"] = relationship()
    tenancy: Mapped["Tenancy"] = relationship()
    tenant: Mapped["User"] = relationship(foreign_keys=[tenant_id])
    releaser: Mapped["User"] = relationship(foreign_keys=[released_by])
