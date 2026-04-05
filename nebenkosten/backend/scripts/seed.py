#!/usr/bin/env python3
"""Seed script: creates admin user and 4 apartments (EG/OG/DG/DU)."""
import os
import sys
import uuid
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.security import get_password_hash
from app.models.user import User, UserRole
from app.models.apartment import Apartment
from app.core.database import Base


def seed():
    engine = create_engine(settings.DATABASE_URL_SYNC)

    with Session(engine) as session:
        # Check if already seeded
        existing_admin = session.execute(
            select(User).where(User.role == UserRole.ADMIN)
        ).scalar_one_or_none()

        if existing_admin:
            print("Database already seeded. Skipping.")
            return

        # Create admin user
        admin_password = os.getenv("ADMIN_PASSWORD", "Admin@Nebenkosten2024!")
        admin = User(
            id=str(uuid.uuid4()),
            email=os.getenv("ADMIN_EMAIL", "admin@nebenkosten.de"),
            name="Administrator",
            password_hash=get_password_hash(admin_password),
            role=UserRole.ADMIN,
            is_active=True,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        session.add(admin)

        # Create 4 apartments
        apartments = [
            {
                "code": "EG",
                "name": "Erdgeschoss",
                "description": "Wohnung im Erdgeschoss",
                "floor": 0,
                "has_washer_meter": True,
                "has_zenner_meter": True,
                "is_owner_occupied": False,
                "heating_share_factor": 1.0,
                "tax_share_factor": 1.0,
            },
            {
                "code": "OG",
                "name": "Obergeschoss",
                "description": "Wohnung im Obergeschoss",
                "floor": 1,
                "has_washer_meter": True,
                "has_zenner_meter": True,
                "is_owner_occupied": False,
                "heating_share_factor": 1.0,
                "tax_share_factor": 1.0,
            },
            {
                "code": "DG",
                "name": "Dachgeschoss",
                "description": "Wohnung im Dachgeschoss",
                "floor": 2,
                "has_washer_meter": True,
                "has_zenner_meter": True,
                "is_owner_occupied": False,
                "heating_share_factor": 1.0,
                "tax_share_factor": 1.0,
            },
            {
                "code": "DU",
                "name": "Eigentümereinheit",
                "description": "Eigentumswohnung (Eigennutzung)",
                "floor": 1,
                "has_washer_meter": False,
                "has_zenner_meter": False,
                "is_owner_occupied": True,
                "heating_share_factor": 0.0,  # no heating costs via Zenner
                "tax_share_factor": 2.0,  # 2 shares for property tax
            },
        ]

        for apt_data in apartments:
            apt = Apartment(
                id=str(uuid.uuid4()),
                created_at=datetime.now(timezone.utc),
                **apt_data
            )
            session.add(apt)

        session.commit()
        print(f"✓ Admin user created: {admin.email} / password: {admin_password}")
        print(f"  WICHTIG: Ändern Sie das Admin-Passwort nach dem ersten Login!")
        print("✓ Apartments created: EG, OG, DG, DU")


if __name__ == "__main__":
    seed()
