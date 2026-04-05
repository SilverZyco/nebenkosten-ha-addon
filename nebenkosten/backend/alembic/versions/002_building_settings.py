"""Add building_settings table for main meter serial numbers

Revision ID: 002_building_settings
Revises: 001_initial
Create Date: 2025-01-01 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "002_building_settings"
down_revision = "001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "building_settings",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("water_main_meter_id", sa.String(100), nullable=True),
        sa.Column("gas_main_meter_id", sa.String(100), nullable=True),
        sa.Column("electricity_common_meter_id", sa.String(100), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("building_settings")
