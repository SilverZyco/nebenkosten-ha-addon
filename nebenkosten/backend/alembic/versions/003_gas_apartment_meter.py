"""Add gas_apartment meter type for owner-occupied apartments

Revision ID: 003_gas_apartment_meter
Revises: 002_building_settings
Create Date: 2026-03-08 00:00:00.000000
"""
from alembic import op

revision = "003_gas_apartment_meter"
down_revision = "002_building_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # PostgreSQL requires explicit ALTER TYPE to add new enum values
    op.execute("ALTER TYPE metertype ADD VALUE IF NOT EXISTS 'gas_apartment'")


def downgrade() -> None:
    # PostgreSQL does not support removing enum values; no-op downgrade
    pass
