from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime, date
from decimal import Decimal
from app.models.billing import BillingStatus


class BillingCalculateRequest(BaseModel):
    year: int


class BillingFinalizeRequest(BaseModel):
    billing_period_id: str
    notes: Optional[str] = None


class BillingReleaseRequest(BaseModel):
    apartment_billing_id: str


class BillingPeriodResponse(BaseModel):
    id: str
    year: int
    status: BillingStatus
    warnings: Optional[List[Any]]
    generated_at: Optional[datetime]
    finalized_at: Optional[datetime]
    notes: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class CostLineItem(BaseModel):
    category: str
    description: str
    total_house_cost: Decimal
    apartment_share: Decimal
    calculation_method: str
    days_occupied: Optional[int] = None
    days_in_year: Optional[int] = None


class ApartmentBillingResponse(BaseModel):
    id: str
    billing_period_id: str
    apartment_id: str
    tenancy_id: Optional[str]
    tenant_id: Optional[str]
    cost_breakdown: Optional[Dict[str, Any]]
    total_costs: Decimal
    advance_payments: Decimal
    balance: Decimal
    pdf_filename: Optional[str]
    is_released: bool
    released_at: Optional[datetime]
    apartment_code: Optional[str] = None
    tenant_name: Optional[str] = None
    year: Optional[int] = None
    tenancy_start: Optional[str] = None
    tenancy_end: Optional[str] = None
    receipt_filename: Optional[str] = None
    receipt_generated_at: Optional[datetime] = None
    receipt_payment_method: Optional[str] = None
    receipt_payment_date: Optional[date] = None

    class Config:
        from_attributes = True
