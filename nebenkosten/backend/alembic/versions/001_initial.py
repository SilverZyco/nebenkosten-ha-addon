"""Initial schema

Revision ID: 001_initial
Revises:
Create Date: 2024-01-01 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Users
    op.create_table(
        "users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("role", sa.Enum("admin", "tenant", name="userrole"), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("phone", sa.String(50), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_users_email", "users", ["email"])

    # Apartments
    op.create_table(
        "apartments",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("code", sa.String(10), nullable=False, unique=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.String(500), nullable=True),
        sa.Column("floor", sa.Integer(), nullable=True),
        sa.Column("area_sqm", sa.Float(), nullable=True),
        sa.Column("water_meter_id", sa.String(100), nullable=True),
        sa.Column("washer_meter_id", sa.String(100), nullable=True),
        sa.Column("zenner_meter_id", sa.String(100), nullable=True),
        sa.Column("has_washer_meter", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("has_zenner_meter", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_owner_occupied", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("heating_share_factor", sa.Float(), nullable=False, server_default="1.0"),
        sa.Column("tax_share_factor", sa.Float(), nullable=False, server_default="1.0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    # Waste bin mappings
    op.create_table(
        "waste_bin_mappings",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("bin_id", sa.String(100), nullable=False),
        sa.Column("apartment_id", sa.String(36), sa.ForeignKey("apartments.id"), nullable=False),
        sa.Column("valid_from", sa.Date(), nullable=False),
        sa.Column("valid_to", sa.Date(), nullable=True),
        sa.Column("notes", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_waste_bin_mappings_bin_id", "waste_bin_mappings", ["bin_id"])

    # Tenancies
    op.create_table(
        "tenancies",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("apartment_id", sa.String(36), sa.ForeignKey("apartments.id"), nullable=False),
        sa.Column("tenant_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("monthly_advance_payment", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("monthly_rent", sa.Numeric(10, 2), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_tenancies_apartment_id", "tenancies", ["apartment_id"])
    op.create_index("ix_tenancies_tenant_id", "tenancies", ["tenant_id"])

    # Documents
    op.create_table(
        "documents",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("filename", sa.String(500), nullable=False),
        sa.Column("original_filename", sa.String(500), nullable=False),
        sa.Column("document_type", sa.Enum(
            "water_invoice", "gas_invoice", "waste_invoice_evs",
            "maintenance_invoice", "chimney_sweep_invoice",
            "electricity_common_invoice", "rainwater_fee_invoice",
            "property_tax_notice", "insurance_invoice",
            "contract", "meter_reading", "handover_protocol", "house_rules", "other",
            name="documenttype"
        ), nullable=False),
        sa.Column("status", sa.Enum(
            "uploaded", "ocr_processing", "ocr_done", "ai_processing",
            "ai_extracted", "confirmed", "rejected",
            name="documentstatus"
        ), nullable=False),
        sa.Column("upload_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("uploaded_by", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("year", sa.Integer(), nullable=True),
        sa.Column("invoice_date", sa.Date(), nullable=True),
        sa.Column("service_period_from", sa.Date(), nullable=True),
        sa.Column("service_period_to", sa.Date(), nullable=True),
        sa.Column("total_amount", sa.Numeric(12, 2), nullable=True),
        sa.Column("supplier_name", sa.String(500), nullable=True),
        sa.Column("invoice_number", sa.String(200), nullable=True),
        sa.Column("bill_total_kwh", sa.Numeric(12, 3), nullable=True),
        sa.Column("is_billable", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("is_visible_to_tenant", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("ocr_text", sa.Text(), nullable=True),
        sa.Column("ai_json", sa.JSON(), nullable=True),
        sa.Column("ai_notes", sa.Text(), nullable=True),
        sa.Column("confirmed_by", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
    )
    op.create_index("ix_documents_year", "documents", ["year"])

    # Meter readings
    op.create_table(
        "meter_readings",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("apartment_id", sa.String(36), sa.ForeignKey("apartments.id"), nullable=True),
        sa.Column("meter_type", sa.Enum(
            "water_apartment", "water_washer", "water_main", "zenner_heat", "gas_main",
            name="metertype"
        ), nullable=False),
        sa.Column("reading_date", sa.Date(), nullable=False),
        sa.Column("value", sa.Numeric(14, 3), nullable=False),
        sa.Column("unit", sa.String(20), nullable=False),
        sa.Column("year", sa.Integer(), nullable=True),
        sa.Column("is_start_of_year", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_end_of_year", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_intermediate", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("reading_by", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_meter_readings_year", "meter_readings", ["year"])
    op.create_index("ix_meter_readings_reading_date", "meter_readings", ["reading_date"])

    # Billing periods
    op.create_table(
        "billing_periods",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("year", sa.Integer(), nullable=False, unique=True),
        sa.Column("status", sa.Enum("draft", "calculated", "finalized", "sent", name="billingstatus"), nullable=False),
        sa.Column("calculation_data", sa.JSON(), nullable=True),
        sa.Column("warnings", sa.JSON(), nullable=True),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finalized_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("generated_by", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_billing_periods_year", "billing_periods", ["year"])

    # Apartment billings
    op.create_table(
        "apartment_billings",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("billing_period_id", sa.String(36), sa.ForeignKey("billing_periods.id"), nullable=False),
        sa.Column("apartment_id", sa.String(36), sa.ForeignKey("apartments.id"), nullable=False),
        sa.Column("tenancy_id", sa.String(36), sa.ForeignKey("tenancies.id"), nullable=True),
        sa.Column("tenant_id", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("calculation_details", sa.JSON(), nullable=True),
        sa.Column("cost_breakdown", sa.JSON(), nullable=True),
        sa.Column("total_costs", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("advance_payments", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("balance", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("pdf_filename", sa.String(500), nullable=True),
        sa.Column("pdf_generated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_released", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("released_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("released_by", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    # Audit log
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("action", sa.String(200), nullable=False),
        sa.Column("entity_type", sa.String(100), nullable=True),
        sa.Column("entity_id", sa.String(36), nullable=True),
        sa.Column("details", sa.JSON(), nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_audit_logs_action", "audit_logs", ["action"])
    op.create_index("ix_audit_logs_entity_type", "audit_logs", ["entity_type"])
    op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"])


def downgrade() -> None:
    op.drop_table("audit_logs")
    op.drop_table("apartment_billings")
    op.drop_table("billing_periods")
    op.drop_table("meter_readings")
    op.drop_table("documents")
    op.drop_table("tenancies")
    op.drop_table("waste_bin_mappings")
    op.drop_table("apartments")
    op.drop_table("users")
