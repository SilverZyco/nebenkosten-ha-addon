from fastapi import APIRouter
from app.api.auth import router as auth_router
from app.api.admin.users import router as admin_users_router
from app.api.admin.apartments import router as admin_apartments_router
from app.api.admin.documents import router as admin_documents_router
from app.api.admin.ki_inbox import router as admin_ki_router
from app.api.admin.meter_readings import router as admin_meter_router
from app.api.admin.billing import router as admin_billing_router
from app.api.admin.settings import router as admin_settings_router
from app.api.admin.rental_contracts import router as admin_rental_contracts_router
from app.api.admin.apartment_keys import router as admin_apartment_keys_router
from app.api.admin.rent_increases import router as admin_rent_increases_router
from app.api.admin.house_documents import router as admin_house_documents_router
from app.api.admin.backup import router as admin_backup_router
from app.api.tenant.documents import router as tenant_documents_router
from app.api.tenant.house_documents import router as tenant_house_documents_router
from app.api.tenant.billing import router as tenant_billing_router
from app.api.tenant.rental_contracts import router as tenant_rental_contracts_router
from app.api.tenant.rent_increases import router as tenant_rent_increases_router

api_router = APIRouter()

api_router.include_router(auth_router)
api_router.include_router(admin_users_router, prefix="/admin")
api_router.include_router(admin_apartments_router, prefix="/admin")
api_router.include_router(admin_documents_router, prefix="/admin")
api_router.include_router(admin_ki_router, prefix="/admin")
api_router.include_router(admin_meter_router, prefix="/admin")
api_router.include_router(admin_billing_router, prefix="/admin")
api_router.include_router(admin_settings_router, prefix="/admin")
api_router.include_router(admin_rental_contracts_router, prefix="/admin")
api_router.include_router(admin_apartment_keys_router, prefix="/admin")
api_router.include_router(admin_rent_increases_router, prefix="/admin")
api_router.include_router(admin_house_documents_router, prefix="/admin")
api_router.include_router(admin_backup_router, prefix="/admin")
api_router.include_router(tenant_documents_router)
api_router.include_router(tenant_billing_router)
api_router.include_router(tenant_rental_contracts_router)
api_router.include_router(tenant_rent_increases_router)
api_router.include_router(tenant_house_documents_router)
