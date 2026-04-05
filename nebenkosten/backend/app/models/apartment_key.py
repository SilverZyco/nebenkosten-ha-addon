import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Integer, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class ApartmentKey(Base):
    __tablename__ = "apartment_keys"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    apartment_id: Mapped[str] = mapped_column(String(36), ForeignKey("apartments.id"), nullable=False, index=True)
    key_type: Mapped[str] = mapped_column(String(50), nullable=False)  # 'mailbox' | 'front_door'
    key_number: Mapped[str] = mapped_column(String(100), nullable=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    apartment: Mapped["Apartment"] = relationship()
