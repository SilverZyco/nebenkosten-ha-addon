"""012_meter_replacement - Zählertausch Support

Revision ID: 012
Revises: 011
Create Date: 2026-03-11
"""
from alembic import op
import sqlalchemy as sa

revision = '012_meter_replacement'
down_revision = '011_rent_increase_notices'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('meter_readings', sa.Column('is_replacement_start', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('meter_readings', sa.Column('meter_serial', sa.String(100), nullable=True))


def downgrade():
    op.drop_column('meter_readings', 'is_replacement_start')
    op.drop_column('meter_readings', 'meter_serial')
