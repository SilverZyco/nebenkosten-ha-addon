"""Add has_cellar and deposit_months to rental_contracts

Revision ID: 010_rental_contract_options
Revises: 009_apartment_keys
Create Date: 2026-03-08
"""
from alembic import op
import sqlalchemy as sa

revision = "010_rental_contract_options"
down_revision = "009_apartment_keys"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("rental_contracts", sa.Column("has_cellar", sa.Boolean, nullable=False, server_default="true"))
    op.add_column("rental_contracts", sa.Column("deposit_months", sa.Integer, nullable=False, server_default="3"))


def downgrade() -> None:
    op.drop_column("rental_contracts", "deposit_months")
    op.drop_column("rental_contracts", "has_cellar")
