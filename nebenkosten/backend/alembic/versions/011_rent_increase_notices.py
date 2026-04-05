"""Add rent_increase_notices table."""
from alembic import op
import sqlalchemy as sa

revision = "011_rent_increase_notices"
down_revision = "010_rental_contract_options"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "rent_increase_notices",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("apartment_id", sa.String(36), sa.ForeignKey("apartments.id"), nullable=False, index=True),
        sa.Column("tenant_user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=True, index=True),
        sa.Column("tenant_name", sa.String(500), nullable=False),
        sa.Column("old_monthly_rent", sa.Numeric(10, 2), nullable=False),
        sa.Column("old_advance_payment", sa.Numeric(10, 2), nullable=False),
        sa.Column("new_monthly_rent", sa.Numeric(10, 2), nullable=False),
        sa.Column("new_advance_payment", sa.Numeric(10, 2), nullable=False),
        sa.Column("effective_date", sa.Date, nullable=False),
        sa.Column("reason", sa.Text, nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("tenant_signature", sa.Text, nullable=True),
        sa.Column("tenant_signed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("tenant_signed_ip", sa.String(100), nullable=True),
        sa.Column("pdf_filename", sa.String(500), nullable=True),
        sa.Column("applied_to_tenancy", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )


def downgrade():
    op.drop_table("rent_increase_notices")
