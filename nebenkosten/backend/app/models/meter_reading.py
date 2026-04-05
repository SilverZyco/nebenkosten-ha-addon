import uuid
from datetime import datetime, date, timezone
from decimal import Decimal
from enum import Enum as PyEnum
from sqlalchemy import String, Boolean, DateTime, Date, Numeric, ForeignKey, Text, Enum, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class MeterType(str, PyEnum):
    WATER_APARTMENT = "water_apartment"          # Wohnungswasserzähler m³
    WATER_WASHER = "water_washer"                # Waschmaschinenzähler m³
    WATER_MAIN = "water_main"                    # Hauptwasserzähler m³
    ZENNER_HEAT = "zenner_heat"                  # Zenner Zelsius Wärmemengenzähler MWh
    GAS_MAIN = "gas_main"                        # Hausgaszähler m³
    GAS_APARTMENT = "gas_apartment"              # Eigentümer-Gaszähler m³ (eigener Anschluss, kein Zenner)
    ELECTRICITY_COMMON = "electricity_common"    # Allgemeinstrom kWh


METER_TYPE_LABELS = {
    MeterType.WATER_APARTMENT: "Wohnungswasserzähler",
    MeterType.WATER_WASHER: "Waschmaschinenzähler",
    MeterType.WATER_MAIN: "Hauptwasserzähler",
    MeterType.ZENNER_HEAT: "Wärmemengenzähler (Zenner)",
    MeterType.GAS_MAIN: "Hausgaszähler",
    MeterType.GAS_APARTMENT: "Gaszähler Eigentümer",
    MeterType.ELECTRICITY_COMMON: "Allgemeinstrom",
}

METER_UNITS = {
    MeterType.WATER_APARTMENT: "m³",
    MeterType.WATER_WASHER: "m³",
    MeterType.WATER_MAIN: "m³",
    MeterType.ZENNER_HEAT: "MWh",
    MeterType.GAS_MAIN: "m³",
    MeterType.GAS_APARTMENT: "m³",
    MeterType.ELECTRICITY_COMMON: "kWh",
}


class MeterReading(Base):
    __tablename__ = "meter_readings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    apartment_id: Mapped[str] = mapped_column(String(36), ForeignKey("apartments.id"), nullable=True, index=True)
    meter_type: Mapped[MeterType] = mapped_column(Enum(MeterType, values_callable=lambda x: [e.value for e in x]), nullable=False)
    reading_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    value: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False)
    unit: Mapped[str] = mapped_column(String(20), nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=True, index=True)
    is_start_of_year: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_end_of_year: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_intermediate: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)  # Zwischenablesung bei Mieterwechsel
    is_replacement_start: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)  # Startstand neuer Zähler nach Tausch
    meter_serial: Mapped[str] = mapped_column(String(100), nullable=True)  # Zählerseriennummer (optional)
    reading_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    photo_filename: Mapped[str] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        default=lambda: datetime.now(timezone.utc)
    )

    apartment: Mapped["Apartment"] = relationship()
    reader: Mapped["User"] = relationship()
