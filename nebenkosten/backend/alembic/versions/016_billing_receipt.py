"""016_billing_receipt - Quittungs-PDF Referenz

Revision ID: 016_billing_receipt
Revises: 015_house_document_text
Create Date: 2026-04-03
"""
from alembic import op
import sqlalchemy as sa

revision = '016_billing_receipt'
down_revision = '015_house_document_text'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('apartment_billings', sa.Column('receipt_filename', sa.String(500), nullable=True))
    op.add_column('apartment_billings', sa.Column('receipt_generated_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('apartment_billings', sa.Column('receipt_payment_method', sa.String(50), nullable=True))
    op.add_column('apartment_billings', sa.Column('receipt_payment_date', sa.Date, nullable=True))


def downgrade():
    op.drop_column('apartment_billings', 'receipt_payment_date')
    op.drop_column('apartment_billings', 'receipt_payment_method')
    op.drop_column('apartment_billings', 'receipt_generated_at')
    op.drop_column('apartment_billings', 'receipt_filename')
