from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, date
from decimal import Decimal


class ApartmentCreate(BaseModel):
    code: str
    name: str
    description: Optional[str] = None
    floor: Optional[int] = None
    area_sqm: Optional[float] = None
    water_meter_id: Optional[str] = None
    washer_meter_id: Optional[str] = None
    zenner_meter_id: Optional[str] = None
    has_washer_meter: bool = False
    has_zenner_meter: bool = False
    is_owner_occupied: bool = False
    heating_share_factor: float = 1.0
    tax_share_factor: float = 1.0


class ApartmentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    floor: Optional[int] = None
    area_sqm: Optional[float] = None
    water_meter_id: Optional[str] = None
    washer_meter_id: Optional[str] = None
    zenner_meter_id: Optional[str] = None
    has_washer_meter: Optional[bool] = None
    has_zenner_meter: Optional[bool] = None
    heating_share_factor: Optional[float] = None
    tax_share_factor: Optional[float] = None


class WasteBinMappingCreate(BaseModel):
    bin_id: str
    apartment_id: str
    valid_from: Optional[date] = None
    valid_to: Optional[date] = None
    notes: Optional[str] = None


class WasteBinMappingResponse(BaseModel):
    id: str
    bin_id: str
    apartment_id: str
    valid_from: date
    valid_to: Optional[date]
    notes: Optional[str]

    class Config:
        from_attributes = True


class ApartmentResponse(BaseModel):
    id: str
    code: str
    name: str
    description: Optional[str]
    floor: Optional[int]
    area_sqm: Optional[float]
    water_meter_id: Optional[str]
    washer_meter_id: Optional[str]
    zenner_meter_id: Optional[str]
    has_washer_meter: bool
    has_zenner_meter: bool
    is_owner_occupied: bool
    heating_share_factor: float
    tax_share_factor: float
    waste_bin_mappings: List[WasteBinMappingResponse] = []

    class Config:
        from_attributes = True


class TenancyCreate(BaseModel):
    apartment_id: str
    tenant_id: str
    start_date: date
    end_date: Optional[date] = None
    monthly_advance_payment: Decimal = Decimal("0.00")
    monthly_rent: Optional[Decimal] = None
    notes: Optional[str] = None


class TenancyUpdate(BaseModel):
    end_date: Optional[date] = None
    monthly_advance_payment: Optional[Decimal] = None
    monthly_rent: Optional[Decimal] = None
    notes: Optional[str] = None


class TenancyResponse(BaseModel):
    id: str
    apartment_id: str
    tenant_id: str
    start_date: date
    end_date: Optional[date]
    monthly_advance_payment: Decimal
    monthly_rent: Optional[Decimal]
    notes: Optional[str]
    tenant_name: Optional[str] = None
    apartment_code: Optional[str] = None

    class Config:
        from_attributes = True
