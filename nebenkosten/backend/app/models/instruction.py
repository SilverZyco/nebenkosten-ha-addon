import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class Instruction(Base):
    __tablename__ = "instructions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))

    title: Mapped[str] = mapped_column(String(500), nullable=False)
    filename: Mapped[str] = mapped_column(String(500), nullable=False)  # stored in UPLOAD_DIR

    # Optional: assigned to a specific tenant user
    tenant_user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True, index=True)

    # True = sent to tenant (visible in tenant portal), False = draft
    is_sent: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    tenant_user: Mapped["User"] = relationship(foreign_keys=[tenant_user_id])
