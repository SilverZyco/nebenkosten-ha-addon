import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class BuildingSettings(Base):
    """Singleton table for house-level configuration (main meters, etc.)."""
    __tablename__ = "building_settings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))

    # Main meter serial numbers (for photo-scan identification)
    water_main_meter_id: Mapped[str] = mapped_column(String(100), nullable=True)
    gas_main_meter_id: Mapped[str] = mapped_column(String(100), nullable=True)
    electricity_common_meter_id: Mapped[str] = mapped_column(String(100), nullable=True)

    # House / owner info for PDF header
    house_address: Mapped[str] = mapped_column(String(200), nullable=True)
    owner_name: Mapped[str] = mapped_column(String(200), nullable=True)
    rental_address: Mapped[str] = mapped_column(String(200), nullable=True)

    # Bank details for PDF footer
    bank_name: Mapped[str] = mapped_column(String(200), nullable=True)
    bank_iban: Mapped[str] = mapped_column(String(50), nullable=True)
    bank_bic: Mapped[str] = mapped_column(String(20), nullable=True)
    bank_account_holder: Mapped[str] = mapped_column(String(200), nullable=True)

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=True,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
