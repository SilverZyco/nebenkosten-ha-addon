"""013_wastewater_amount - Schmutzwasser-Betrag als eigene Spalte

Revision ID: 013_wastewater_amount
Revises: 012_meter_replacement
Create Date: 2026-03-11
"""
from alembic import op
import sqlalchemy as sa

revision = '013_wastewater_amount'
down_revision = '012_meter_replacement'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('documents', sa.Column('wastewater_amount', sa.Numeric(12, 2), nullable=True))


def downgrade():
    op.drop_column('documents', 'wastewater_amount')
