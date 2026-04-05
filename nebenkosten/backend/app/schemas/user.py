from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.models.user import UserRole


class UserCreate(BaseModel):
    email: Optional[str] = None
    name: str
    password: str
    role: UserRole = UserRole.TENANT
    phone: Optional[str] = None


class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    is_active: Optional[bool] = None


class UserPasswordChange(BaseModel):
    old_password: str
    new_password: str


class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: UserRole
    is_active: bool
    phone: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True
