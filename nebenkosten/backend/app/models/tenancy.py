import uuid
from datetime import datetime, date, timezone
from decimal import Decimal
from sqlalchemy import String, DateTime, Date, Numeric, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class Tenancy(Base):
    """Represents a tenancy period for an apartment."""
    __tablename__ = "tenancies"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    apartment_id: Mapped[str] = mapped_column(String(36), ForeignKey("apartments.id"), nullable=False, index=True)
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=True)  # None = active
    monthly_advance_payment: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    monthly_rent: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=True)
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        default=lambda: datetime.now(timezone.utc)
    )

    apartment: Mapped["Apartment"] = relationship(back_populates="tenancies")
    tenant: Mapped["User"] = relationship()
