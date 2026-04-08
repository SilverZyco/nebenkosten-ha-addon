"""018 instructions table

Revision ID: 018
Revises: 017
Create Date: 2026-04-08
"""
from alembic import op
import sqlalchemy as sa

revision = '018'
down_revision = '017_photo_filename'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'instructions',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('title', sa.String(500), nullable=False),
        sa.Column('filename', sa.String(500), nullable=False),
        sa.Column('tenant_user_id', sa.String(36), sa.ForeignKey('users.id'), nullable=True, index=True),
        sa.Column('is_sent', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )


def downgrade():
    op.drop_table('instructions')
