"""Add apartment_id, rainwater_amount to documents; add instruction/ancillary_costs_notice types

Revision ID: 004_document_extensions
Revises: 003_gas_apartment_meter
Create Date: 2026-03-08 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "004_document_extensions"
down_revision = "003_gas_apartment_meter"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add new document type enum values
    op.execute("ALTER TYPE documenttype ADD VALUE IF NOT EXISTS 'instruction'")
    op.execute("ALTER TYPE documenttype ADD VALUE IF NOT EXISTS 'ancillary_costs_notice'")

    # Add apartment_id to documents (for tenant-specific docs like Belehrungen, Mietvertrag)
    op.add_column(
        "documents",
        sa.Column("apartment_id", sa.String(36), sa.ForeignKey("apartments.id"), nullable=True),
    )
    op.create_index("ix_documents_apartment_id", "documents", ["apartment_id"])

    # Add rainwater_amount to documents (Niederschlagswasser embedded in water invoice)
    op.add_column(
        "documents",
        sa.Column("rainwater_amount", sa.Numeric(12, 2), nullable=True),
    )


def downgrade() -> None:
    op.drop_index("ix_documents_apartment_id", table_name="documents")
    op.drop_column("documents", "apartment_id")
    op.drop_column("documents", "rainwater_amount")
    # Note: PostgreSQL does not support removing enum values easily
