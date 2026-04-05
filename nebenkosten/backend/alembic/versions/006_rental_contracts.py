"""Add rental_contracts table

Revision ID: 006_rental_contracts
Revises: 005_settings_bank_address
Create Date: 2026-03-08
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "006_rental_contracts"
down_revision = "005_settings_bank_address"
branch_labels = None
depends_on = None

# Use postgresql.ENUM with create_type=False so SQLAlchemy never issues
# a separate CREATE TYPE statement — we manage it ourselves via op.execute().
_status_enum = postgresql.ENUM(
    "draft", "sent", "signed",
    name="rentalcontractstatus",
    create_type=False,
)


def upgrade() -> None:
    # Create enum type idempotently (handles partial-run dirty state)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE rentalcontractstatus AS ENUM ('draft', 'sent', 'signed');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)

    # Create table only if it doesn't already exist
    op.execute("""
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_name = 'rental_contracts'
            ) THEN
                PERFORM 1;  -- will not reach CREATE TABLE below if table exists
            END IF;
        END $$;
    """)

    conn = op.get_bind()
    if conn.dialect.has_table(conn, "rental_contracts"):
        return  # Migration was partially applied, table already exists

    op.create_table(
        "rental_contracts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("apartment_id", sa.String(36), sa.ForeignKey("apartments.id"), nullable=False),
        sa.Column("tenancy_id", sa.String(36), sa.ForeignKey("tenancies.id"), nullable=True),
        sa.Column("tenant_name", sa.String(500), nullable=False),
        sa.Column("tenant_address1", sa.String(200), nullable=True),
        sa.Column("tenant_address2", sa.String(200), nullable=True),
        sa.Column("tenant_address3", sa.String(200), nullable=True),
        sa.Column("start_date", sa.Date, nullable=False),
        sa.Column("monthly_rent", sa.Numeric(10, 2), nullable=False),
        sa.Column("advance_payment", sa.Numeric(10, 2), nullable=False),
        sa.Column("kitchen_fee", sa.Numeric(10, 2), nullable=True),
        sa.Column("deposit", sa.Numeric(10, 2), nullable=False),
        sa.Column("special_notes", sa.Text, nullable=True),
        sa.Column("status", _status_enum, nullable=False, server_default="draft"),
        sa.Column("tenant_signature", sa.Text, nullable=True),
        sa.Column("tenant_signed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("tenant_signed_ip", sa.String(100), nullable=True),
        sa.Column("pdf_filename", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_rental_contracts_apartment_id", "rental_contracts", ["apartment_id"])


def downgrade() -> None:
    op.drop_index("ix_rental_contracts_apartment_id", table_name="rental_contracts")
    op.drop_table("rental_contracts")
    op.execute("DROP TYPE IF EXISTS rentalcontractstatus")
