"""Add apartment_keys table

Revision ID: 009_apartment_keys
Revises: 008_rental_contract_extras
Create Date: 2026-03-08
"""
from alembic import op
import sqlalchemy as sa

revision = "009_apartment_keys"
down_revision = "008_rental_contract_extras"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "apartment_keys",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("apartment_id", sa.String(36), sa.ForeignKey("apartments.id"), nullable=False),
        sa.Column("key_type", sa.String(50), nullable=False),   # 'mailbox' | 'front_door'
        sa.Column("key_number", sa.String(100), nullable=True),
        sa.Column("quantity", sa.Integer, nullable=False, server_default="1"),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_apartment_keys_apartment_id", "apartment_keys", ["apartment_id"])


def downgrade() -> None:
    op.drop_index("ix_apartment_keys_apartment_id", table_name="apartment_keys")
    op.drop_table("apartment_keys")
