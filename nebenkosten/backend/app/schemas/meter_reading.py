from pydantic import BaseModel
from typing import Optional
from datetime import datetime, date
from decimal import Decimal
from app.models.meter_reading import MeterType


class MeterReadingCreate(BaseModel):
    apartment_id: Optional[str] = None  # None for main meter
    meter_type: MeterType
    reading_date: date
    value: Decimal
    year: Optional[int] = None
    is_start_of_year: bool = False
    is_end_of_year: bool = False
    is_intermediate: bool = False
    is_replacement_start: bool = False
    meter_serial: Optional[str] = None
    notes: Optional[str] = None
    photo_filename: Optional[str] = None


class MeterReadingUpdate(BaseModel):
    value: Optional[Decimal] = None
    reading_date: Optional[date] = None
    year: Optional[int] = None
    is_start_of_year: Optional[bool] = None
    is_end_of_year: Optional[bool] = None
    is_intermediate: Optional[bool] = None
    is_replacement_start: Optional[bool] = None
    notes: Optional[str] = None


class MeterReadingResponse(BaseModel):
    id: str
    apartment_id: Optional[str]
    meter_type: MeterType
    reading_date: date
    value: Decimal
    unit: str
    year: Optional[int]
    is_start_of_year: bool
    is_end_of_year: bool
    is_intermediate: bool
    is_replacement_start: bool = False
    meter_serial: Optional[str] = None
    notes: Optional[str]
    created_at: datetime
    apartment_code: Optional[str] = None
    photo_filename: Optional[str] = None

    class Config:
        from_attributes = True
