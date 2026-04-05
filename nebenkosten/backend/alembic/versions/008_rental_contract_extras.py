"""Add contract_paragraphs, landlord_signature to rental_contracts

Revision ID: 008_rental_contract_extras
Revises: 007_rental_contract_tenant_user
Create Date: 2026-03-08
"""
from alembic import op
import sqlalchemy as sa

revision = "008_rental_contract_extras"
down_revision = "007_rental_contract_tenant_user"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("rental_contracts", sa.Column("contract_paragraphs", sa.Text, nullable=True))
    op.add_column("rental_contracts", sa.Column("landlord_signature", sa.Text, nullable=True))
    op.add_column("rental_contracts", sa.Column("landlord_signed_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("rental_contracts", "landlord_signed_at")
    op.drop_column("rental_contracts", "landlord_signature")
    op.drop_column("rental_contracts", "contract_paragraphs")
