"""015_house_document_text - Editierbarer Text fuer Hausunterlagen

Revision ID: 015_house_document_text
Revises: 014_house_documents
Create Date: 2026-04-03
"""
from alembic import op
import sqlalchemy as sa

revision = '015_house_document_text'
down_revision = '014_house_documents'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('house_documents', sa.Column('document_text', sa.Text, nullable=True))


def downgrade():
    op.drop_column('house_documents', 'document_text')
