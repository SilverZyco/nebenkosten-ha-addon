"""017_photo_filename - Foto-Dateiname fuer Zaehlerstaende

Revision ID: 017
Revises: 016
Create Date: 2026-04-08
"""
from alembic import op
import sqlalchemy as sa

revision = '017_photo_filename'
down_revision = '016_billing_receipt'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    result = conn.execute(sa.text(
        "SELECT 1 FROM information_schema.columns "
        "WHERE table_name='meter_readings' AND column_name='photo_filename'"
    ))
    if not result.fetchone():
        op.add_column(
            'meter_readings',
            sa.Column('photo_filename', sa.String(200), nullable=True)
        )


def downgrade():
    op.drop_column('meter_readings', 'photo_filename')
