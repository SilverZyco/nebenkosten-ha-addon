import uuid
from datetime import datetime, date, timezone
from sqlalchemy import String, Boolean, DateTime, Date, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class Apartment(Base):
    __tablename__ = "apartments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    code: Mapped[str] = mapped_column(String(10), unique=True, nullable=False)  # EG, OG, DG, DU
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(String(500), nullable=True)
    floor: Mapped[int] = mapped_column(nullable=True)
    area_sqm: Mapped[float] = mapped_column(nullable=True)  # Wohnfläche m²
    # Meter identifiers (serial numbers/labels)
    water_meter_id: Mapped[str] = mapped_column(String(100), nullable=True)
    washer_meter_id: Mapped[str] = mapped_column(String(100), nullable=True)
    zenner_meter_id: Mapped[str] = mapped_column(String(100), nullable=True)
    # Flags
    has_washer_meter: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    has_zenner_meter: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_owner_occupied: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)  # DU = Eigennutzung
    # Heating cost share (1.0 = 1/3 for EG/OG/DG, DU = 0)
    heating_share_factor: Mapped[float] = mapped_column(nullable=False, default=1.0)
    # Property tax shares (DU=2, others=1)
    tax_share_factor: Mapped[float] = mapped_column(nullable=False, default=1.0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        default=lambda: datetime.now(timezone.utc)
    )

    # Relationships
    waste_bin_mappings: Mapped[list["WasteBinMapping"]] = relationship(back_populates="apartment")
    tenancies: Mapped[list["Tenancy"]] = relationship(back_populates="apartment")


class WasteBinMapping(Base):
    """Maps waste bin IDs (Tonnen-Nummer) to apartments."""
    __tablename__ = "waste_bin_mappings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    bin_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True)  # EVS Tonnen-Nummer
    apartment_id: Mapped[str] = mapped_column(String(36), ForeignKey("apartments.id"), nullable=False)
    valid_from: Mapped[date] = mapped_column(Date, nullable=False)
    valid_to: Mapped[date] = mapped_column(Date, nullable=True)
    notes: Mapped[str] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        default=lambda: datetime.now(timezone.utc)
    )

    apartment: Mapped["Apartment"] = relationship(back_populates="waste_bin_mappings")
