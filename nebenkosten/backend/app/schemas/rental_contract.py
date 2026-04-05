import json
from datetime import date, datetime
from decimal import Decimal
from typing import Optional, Dict
from pydantic import BaseModel, field_validator
from app.models.rental_contract import RentalContractStatus


class RentalContractCreate(BaseModel):
    apartment_id: str
    tenancy_id: Optional[str] = None
    tenant_user_id: Optional[str] = None
    tenant_name: str
    tenant_address1: Optional[str] = None
    tenant_address2: Optional[str] = None
    tenant_address3: Optional[str] = None
    start_date: date
    monthly_rent: Decimal
    advance_payment: Decimal
    kitchen_fee: Optional[Decimal] = None
    special_notes: Optional[str] = None
    contract_paragraphs: Optional[Dict[str, str]] = None
    has_cellar: bool = True
    deposit_months: int = 3


class RentalContractUpdate(BaseModel):
    tenant_name: Optional[str] = None
    tenant_address1: Optional[str] = None
    tenant_address2: Optional[str] = None
    tenant_address3: Optional[str] = None
    start_date: Optional[date] = None
    monthly_rent: Optional[Decimal] = None
    advance_payment: Optional[Decimal] = None
    kitchen_fee: Optional[Decimal] = None
    special_notes: Optional[str] = None
    contract_paragraphs: Optional[Dict[str, str]] = None
    has_cellar: Optional[bool] = None
    deposit_months: Optional[int] = None


class RentalContractResponse(BaseModel):
    id: str
    apartment_id: str
    tenancy_id: Optional[str] = None
    tenant_user_id: Optional[str] = None
    tenant_user_name: Optional[str] = None
    tenant_name: str
    tenant_address1: Optional[str] = None
    tenant_address2: Optional[str] = None
    tenant_address3: Optional[str] = None
    start_date: date
    monthly_rent: Decimal
    advance_payment: Decimal
    kitchen_fee: Optional[Decimal] = None
    deposit: Decimal
    special_notes: Optional[str] = None
    contract_paragraphs: Optional[Dict[str, str]] = None
    has_cellar: bool = True
    deposit_months: int = 3
    status: RentalContractStatus
    tenant_signed_at: Optional[datetime] = None
    tenant_signed_ip: Optional[str] = None
    landlord_signed_at: Optional[datetime] = None
    pdf_filename: Optional[str] = None
    created_at: datetime
    apartment_code: Optional[str] = None
    apartment_name: Optional[str] = None
    apartment_area_sqm: Optional[float] = None

    @field_validator("contract_paragraphs", mode="before")
    @classmethod
    def parse_paragraphs(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return None
        return v

    model_config = {"from_attributes": True}
