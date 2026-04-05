"""Add tenant_user_id to rental_contracts

Revision ID: 007_rental_contract_tenant_user
Revises: 006_rental_contracts
Create Date: 2026-03-08
"""
from alembic import op
import sqlalchemy as sa

revision = "007_rental_contract_tenant_user"
down_revision = "006_rental_contracts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "rental_contracts",
        sa.Column("tenant_user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
    )
    op.create_index("ix_rental_contracts_tenant_user_id", "rental_contracts", ["tenant_user_id"])


def downgrade() -> None:
    op.drop_index("ix_rental_contracts_tenant_user_id", table_name="rental_contracts")
    op.drop_column("rental_contracts", "tenant_user_id")
