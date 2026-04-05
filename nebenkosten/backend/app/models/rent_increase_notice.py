import uuid
from datetime import datetime, timezone
from decimal import Decimal
from enum import Enum as PyEnum
from sqlalchemy import String, DateTime, Date, Numeric, ForeignKey, Text, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class RentIncreaseStatus(str, PyEnum):
    DRAFT = "draft"
    SENT = "sent"
    SIGNED = "signed"


class RentIncreaseNotice(Base):
    __tablename__ = "rent_increase_notices"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    apartment_id: Mapped[str] = mapped_column(String(36), ForeignKey("apartments.id"), nullable=False, index=True)
    tenant_user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    tenant_name: Mapped[str] = mapped_column(String(500), nullable=False)
    old_monthly_rent: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    old_advance_payment: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    new_monthly_rent: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    new_advance_payment: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    effective_date: Mapped[datetime] = mapped_column(Date, nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=True)
    status: Mapped[RentIncreaseStatus] = mapped_column(
        String(20),
        nullable=False, default=RentIncreaseStatus.DRAFT,
    )
    tenant_signature: Mapped[str] = mapped_column(Text, nullable=True)
    tenant_signed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    tenant_signed_ip: Mapped[str] = mapped_column(String(100), nullable=True)
    pdf_filename: Mapped[str] = mapped_column(String(500), nullable=True)
    applied_to_tenancy: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
