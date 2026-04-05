"""014_house_documents - Hausunterlagen Tabelle

Revision ID: 014_house_documents
Revises: 013_wastewater_amount
Create Date: 2026-04-03
"""
from alembic import op
import sqlalchemy as sa

revision = '014_house_documents'
down_revision = '013_wastewater_amount'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'house_documents',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('template_filename', sa.String(500), nullable=False),
        sa.Column('title', sa.String(500), nullable=False),
        sa.Column('apartment_id', sa.String(36), sa.ForeignKey('apartments.id'), nullable=True),
        sa.Column('tenant_user_id', sa.String(36), sa.ForeignKey('users.id'), nullable=True, index=True),
        sa.Column('tenant_name', sa.String(500), nullable=True),
        sa.Column('status', sa.String(20), nullable=False, server_default='draft'),
        sa.Column('tenant_signature', sa.Text, nullable=True),
        sa.Column('tenant_signed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('tenant_signed_ip', sa.String(100), nullable=True),
        sa.Column('landlord_signature', sa.Text, nullable=True),
        sa.Column('landlord_signed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('pdf_filename', sa.String(500), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )


def downgrade():
    op.drop_table('house_documents')
