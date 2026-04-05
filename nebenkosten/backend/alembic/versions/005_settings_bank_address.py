"""Add bank details and address to building_settings

Revision ID: 005
Revises: 004
Create Date: 2026-03-08
"""
from alembic import op
import sqlalchemy as sa

revision = "005_settings_bank_address"
down_revision = "004_document_extensions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("building_settings", sa.Column("house_address", sa.String(200), nullable=True))
    op.add_column("building_settings", sa.Column("owner_name", sa.String(200), nullable=True))
    op.add_column("building_settings", sa.Column("bank_name", sa.String(200), nullable=True))
    op.add_column("building_settings", sa.Column("bank_iban", sa.String(50), nullable=True))
    op.add_column("building_settings", sa.Column("bank_bic", sa.String(20), nullable=True))
    op.add_column("building_settings", sa.Column("bank_account_holder", sa.String(200), nullable=True))

    # Pre-fill bank details
    op.execute("""
        UPDATE building_settings SET
            bank_name = 'Kreissparkasse Saarlouis',
            bank_iban = 'DE57 5935 0110 1370 2572 79',
            bank_bic  = 'KRSADE55XXX',
            bank_account_holder = 'Alexander Klingel'
    """)


def downgrade() -> None:
    op.drop_column("building_settings", "bank_account_holder")
    op.drop_column("building_settings", "bank_bic")
    op.drop_column("building_settings", "bank_iban")
    op.drop_column("building_settings", "bank_name")
    op.drop_column("building_settings", "owner_name")
    op.drop_column("building_settings", "house_address")
