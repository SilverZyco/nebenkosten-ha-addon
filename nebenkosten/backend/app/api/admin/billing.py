import os
from typing import List, Optional
from datetime import datetime, timezone
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.core.deps import get_current_admin
from app.core.config import settings
from app.models.user import User
from app.models.billing import BillingPeriod, BillingStatus, ApartmentBilling
from app.models.apartment import Apartment, WasteBinMapping
from app.models.tenancy import Tenancy
from app.models.document import Document, DocumentStatus
from app.models.meter_reading import MeterReading
from app.schemas.billing import (
    BillingCalculateRequest, BillingPeriodResponse, ApartmentBillingResponse
)
from app.services.calculation import BillingCalculator
from app.services.pdf_generation import generate_billing_pdf
from app.services.audit_service import log_action

router = APIRouter(prefix="/billing", tags=["admin-billing"])


@router.get("/preflight/{year}")
async def billing_preflight(
    year: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    """Pre-flight check: returns detailed status of all data required for billing."""
    from datetime import date as _date

    checks = []

    def check(key: str, label: str, status: str, detail: str, link: str = ""):
        checks.append({"key": key, "label": label, "status": status, "detail": detail, "link": link})

    # ── Apartments ────────────────────────────────────────────
    apt_result = await db.execute(select(Apartment).order_by(Apartment.code))
    apartments = apt_result.scalars().all()
    if not apartments:
        check("apartments", "Wohnungen", "error", "Keine Wohnungen konfiguriert", "/admin/wohnungen")
    else:
        check("apartments", "Wohnungen", "ok", f"{len(apartments)} Wohnungen vorhanden", "/admin/wohnungen")

    # ── Tenancies ─────────────────────────────────────────────
    year_start = _date(year, 1, 1)
    year_end = _date(year, 12, 31)
    ten_result = await db.execute(select(Tenancy))
    tenancies = ten_result.scalars().all()
    missing_tenancy = []
    for apt in apartments:
        active = [
            t for t in tenancies
            if t.apartment_id == apt.id
            and t.start_date <= year_end
            and (t.end_date is None or t.end_date >= year_start)
        ]
        if not active:
            missing_tenancy.append(apt.code)
    if missing_tenancy:
        check("tenancies", "Mietverhältnisse", "warning",
              f"Kein Mietverhältnis für {year}: {', '.join(missing_tenancy)}", "/admin/mietverhaeltnisse")
    else:
        check("tenancies", "Mietverhältnisse", "ok",
              f"Alle Wohnungen haben aktive Mietverhältnisse in {year}", "/admin/mietverhaeltnisse")

    # ── Documents helpers ─────────────────────────────────────
    # Include documents assigned to this year OR whose service period overlaps
    doc_result = await db.execute(
        select(Document).where(
            or_(
                and_(Document.year == year, Document.service_period_from == None),
                and_(
                    Document.service_period_from != None,
                    Document.service_period_to != None,
                    Document.service_period_from <= year_end,
                    Document.service_period_to >= year_start,
                ),
            )
        )
    )
    docs = doc_result.scalars().all()
    confirmed_billable = [d for d in docs if d.is_billable and d.status in (DocumentStatus.CONFIRMED, DocumentStatus.UPLOADED)]
    by_type = {}
    for d in confirmed_billable:
        by_type.setdefault(d.document_type, []).append(d)

    # ── Meter readings helper ─────────────────────────────────
    mr_result = await db.execute(select(MeterReading).where(MeterReading.year == year))
    meter_readings = list(mr_result.scalars().all())

    # Preflight also checks previous year's end readings as fallback for start
    prev_mr_result = await db.execute(
        select(MeterReading).where(MeterReading.year == year - 1, MeterReading.is_end_of_year == True)
    )
    prev_end_readings = list(prev_mr_result.scalars().all())

    def has_start_end(apt_id, mtype):
        rows = [r for r in meter_readings if r.apartment_id == apt_id and r.meter_type == mtype]
        has_start = any(r.is_start_of_year for r in rows)
        has_end = any(r.is_end_of_year for r in rows)
        # Fallback: prev year end reading counts as this year's start
        if not has_start:
            has_start = any(r.apartment_id == apt_id and r.meter_type == mtype for r in prev_end_readings)
        return has_start, has_end

    def has_house_start_end(mtype):
        rows = [r for r in meter_readings if r.apartment_id is None and r.meter_type == mtype]
        has_start = any(r.is_start_of_year for r in rows)
        has_end = any(r.is_end_of_year for r in rows)
        # Fallback: prev year end reading counts as this year's start
        if not has_start:
            has_start = any(r.apartment_id is None and r.meter_type == mtype for r in prev_end_readings)
        return has_start, has_end

    # ── Water invoice ──────────────────────────────────────────
    water_docs = by_type.get("water_invoice", [])
    if not water_docs:
        check("water_invoice", "Wasserrechnung", "error",
              f"Keine bestätigte Wasserrechnung für {year}", "/admin/dokumente")
    else:
        check("water_invoice", "Wasserrechnung", "ok",
              f"{len(water_docs)} Rechnung(en) vorhanden", "/admin/dokumente")

    # ── Main water meter (optional – nur für Korrekturfaktor) ──
    ws, we = has_house_start_end("water_main")
    if not ws and not we:
        check("water_main", "Hauptwasserzähler (optional)", "info",
              f"Kein Stand für {year} – optional, wird nur für Korrekturfaktor benötigt", "/admin/zaehlerstaende")
    elif not ws:
        check("water_main", "Hauptwasserzähler (optional)", "warning",
              f"Jahresanfang-Stand fehlt für {year}", "/admin/zaehlerstaende")
    elif not we:
        check("water_main", "Hauptwasserzähler (optional)", "warning",
              f"Jahresende-Stand fehlt für {year}", "/admin/zaehlerstaende")
    else:
        check("water_main", "Hauptwasserzähler (optional)", "ok", f"Start + Ende vorhanden", "/admin/zaehlerstaende")

    # ── Apartment water meters ─────────────────────────────────
    water_missing = []
    for apt in apartments:
        s, e = has_start_end(apt.id, "water_apartment")
        if not s or not e:
            water_missing.append(f"{apt.code}({'Start' if not s else ''}{'/' if not s and not e else ''}{'Ende' if not e else ''})")
    if water_missing:
        check("water_apt_meters", "Wohnungswasserzähler", "warning",
              f"Fehlende Stände: {', '.join(water_missing)}", "/admin/zaehlerstaende")
    else:
        check("water_apt_meters", "Wohnungswasserzähler", "ok",
              "Start + Ende für alle Wohnungen vorhanden", "/admin/zaehlerstaende")

    # ── Gas invoice ────────────────────────────────────────────
    gas_docs = by_type.get("gas_invoice", [])
    if not gas_docs:
        check("gas_invoice", "Gasrechnung", "error",
              f"Keine bestätigte Gasrechnung für {year}", "/admin/dokumente")
    else:
        missing_kwh = [d for d in gas_docs if not d.bill_total_kwh]
        if missing_kwh:
            check("gas_invoice", "Gasrechnung", "warning",
                  f"kWh-Wert fehlt auf {len(missing_kwh)} Rechnung(en) – bitte in KI-Inbox nachtragen", "/admin/ki-inbox")
        else:
            check("gas_invoice", "Gasrechnung", "ok",
                  f"{len(gas_docs)} Rechnung(en) mit kWh-Wert", "/admin/dokumente")

    # ── Zenner meters (Mieter only, required) ─────────────────
    zenner_missing = []
    for apt in apartments:
        if apt.is_owner_occupied:
            continue  # DU optional – see below
        s, e = has_start_end(apt.id, "zenner_heat")
        if not s or not e:
            zenner_missing.append(f"{apt.code}/Zenner({'Start' if not s else ''}{'/' if not s and not e else ''}{'Ende' if not e else ''})")
    if zenner_missing:
        check("gas_meters", "Gas-/Wärmezähler (Zenner)", "warning",
              f"Fehlende Stände: {', '.join(zenner_missing)}", "/admin/zaehlerstaende")
    else:
        check("gas_meters", "Gas-/Wärmezähler (Zenner)", "ok",
              "Start + Ende für alle Mieterzähler vorhanden", "/admin/zaehlerstaende")

    # ── DU gas meter (optional) ────────────────────────────────
    du_apts = [apt for apt in apartments if apt.is_owner_occupied]
    for apt in du_apts:
        s, e = has_start_end(apt.id, "gas_apartment")
        if not s and not e:
            check("gas_du_meter", f"DU Gaszähler (optional)", "info",
                  f"Kein Stand für {year} – optional, nicht für Abrechnung benötigt", "/admin/zaehlerstaende")
        elif not s or not e:
            check("gas_du_meter", f"DU Gaszähler (optional)", "warning",
                  f"{'Start' if not s else 'Ende'}-Stand fehlt für {year}", "/admin/zaehlerstaende")
        else:
            check("gas_du_meter", f"DU Gaszähler (optional)", "ok",
                  "Start + Ende vorhanden", "/admin/zaehlerstaende")

    # ── gas_main (optional) ────────────────────────────────────
    gs, ge = has_house_start_end("gas_main")
    if not gs and not ge:
        check("gas_main", "Hausgaszähler (optional)", "info",
              f"Kein Stand für {year} – optional, nicht für Abrechnung benötigt", "/admin/zaehlerstaende")
    elif not gs or not ge:
        check("gas_main", "Hausgaszähler (optional)", "warning",
              f"{'Start' if not gs else 'Ende'}-Stand fehlt für {year}", "/admin/zaehlerstaende")
    else:
        check("gas_main", "Hausgaszähler (optional)", "ok",
              "Start + Ende vorhanden", "/admin/zaehlerstaende")

    # ── EVS waste invoice ──────────────────────────────────────
    evs_docs = by_type.get("waste_invoice_evs", [])
    if not evs_docs:
        check("evs_invoice", "EVS-Müllrechnung", "error",
              f"Keine bestätigte EVS-Rechnung für {year}", "/admin/dokumente")
    else:
        # Check bin mappings (only valid for the billing year)
        from datetime import date as _date
        pf_year_start = _date(year, 1, 1)
        pf_year_end = _date(year, 12, 31)
        bin_result = await db.execute(
            select(WasteBinMapping).where(
                WasteBinMapping.valid_from <= pf_year_end,
                (WasteBinMapping.valid_to == None) | (WasteBinMapping.valid_to >= pf_year_start),
            )
        )
        bin_mappings = bin_result.scalars().all()
        mapped_bins = {bm.bin_id.lstrip("0") or bm.bin_id for bm in bin_mappings}
        # Extract bin IDs from EVS docs
        unmapped = []
        for d in evs_docs:
            bins = (d.ai_json or {}).get("bins", [])
            for b in bins:
                bid = str(b.get("bin_id", "")).lstrip("0") or str(b.get("bin_id", ""))
                if bid and bid not in mapped_bins:
                    unmapped.append(bid)
        if unmapped:
            check("evs_invoice", "EVS-Müllrechnung", "warning",
                  f"Tonnen ohne Zuordnung: {', '.join(set(unmapped))} – bitte in KI-Inbox zuordnen", "/admin/ki-inbox")
        else:
            check("evs_invoice", "EVS-Müllrechnung", "ok",
                  f"{len(evs_docs)} Rechnung(en), alle Tonnen zugeordnet", "/admin/dokumente")

    # ── Required invoices (Pflichtbelege) ──────────────────────
    # Grundsteuerbescheid
    ptax_docs = by_type.get("property_tax_notice", [])
    if ptax_docs:
        check("property_tax_notice", "Grundsteuerbescheid", "ok",
              f"{len(ptax_docs)} Beleg(e) vorhanden", "/admin/dokumente")
    else:
        check("property_tax_notice", "Grundsteuerbescheid", "error",
              f"Kein Beleg für {year} – Pflichtangabe für Abrechnung (manuell erfassen)", "/admin/dokumente")

    # Gebäudeversicherung
    ins_docs = by_type.get("insurance_invoice", [])
    if ins_docs:
        check("insurance_invoice", "Gebäudeversicherung", "ok",
              f"{len(ins_docs)} Beleg(e) vorhanden", "/admin/dokumente")
    else:
        check("insurance_invoice", "Gebäudeversicherung", "error",
              f"Kein Beleg für {year} – Pflichtangabe für Abrechnung (Dokument hochladen + KI-Analyse)", "/admin/dokumente")

    # Niederschlagswassergebühr – kann in Wasserrechnung enthalten sein (rainwater_amount)
    rain_docs = by_type.get("rainwater_fee_invoice", [])
    water_with_rain = [d for d in confirmed_billable if d.document_type == "water_invoice" and d.total_amount]
    # Check if any water invoice has rainwater_amount set
    water_rain_docs = [d for d in docs if d.document_type == "water_invoice" and getattr(d, "rainwater_amount", None)]
    if rain_docs:
        check("rainwater_fee_invoice", "Niederschlagswassergebühr", "ok",
              f"{len(rain_docs)} separater Beleg vorhanden", "/admin/dokumente")
    elif water_rain_docs:
        check("rainwater_fee_invoice", "Niederschlagswassergebühr", "ok",
              f"Niederschlagsbetrag in {len(water_rain_docs)} Wasserrechnung(en) enthalten", "/admin/dokumente")
    else:
        check("rainwater_fee_invoice", "Niederschlagswassergebühr", "error",
              f"Kein Beleg für {year} – entweder separaten Beleg hochladen oder Betrag in Wasserrechnung eintragen", "/admin/dokumente")

    # Allgemeinstrom
    elec_docs = by_type.get("electricity_common_invoice", [])
    if elec_docs:
        check("electricity_common_invoice", "Allgemeinstrom", "ok",
              f"{len(elec_docs)} Beleg(e) vorhanden", "/admin/dokumente")
    else:
        check("electricity_common_invoice", "Allgemeinstrom", "error",
              f"Kein Beleg für {year} – Pflichtangabe für Abrechnung", "/admin/dokumente")

    # ── Optional invoices ──────────────────────────────────────
    optional = [
        ("maintenance_invoice", "Wartungsrechnung"),
        ("chimney_sweep_invoice", "Schornsteinfeger"),
    ]
    for dtype, dlabel in optional:
        opt_docs = by_type.get(dtype, [])
        if opt_docs:
            check(dtype, dlabel, "ok", f"{len(opt_docs)} Beleg(e) vorhanden", "/admin/dokumente")
        else:
            check(dtype, dlabel, "info", f"Kein Beleg für {year} (optional)", "/admin/dokumente")

    errors = [c for c in checks if c["status"] == "error"]
    warnings = [c for c in checks if c["status"] == "warning"]
    can_calculate = len(errors) == 0

    return {
        "year": year,
        "checks": checks,
        "can_calculate": can_calculate,
        "error_count": len(errors),
        "warning_count": len(warnings),
    }


@router.get("/demo-pdf")
async def download_demo_pdf(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    """Generate and return a demo Nebenkostenabrechnung PDF with sample data."""
    import uuid, tempfile
    demo_data = {
        "year": 2025,
        "apartment_code": "OG",
        "tenant_name": "Max Mustermann",
        "tenancy_start": "2025-01-01",
        "tenancy_end": "2025-12-31",
        "advance_payments": "1440.00",
        "balance": "187.42",
        "cost_breakdown": {
            "water": {
                "cost": "312.80",
                "m3_adjusted": "48",
                "factor": "0.25",
            },
            "gas": {
                "cost": "624.50",
                "kwh_adjusted": "4250",
                "factor": "0.25",
            },
            "rainwater": {"cost": "38.20"},
            "electricity_common": {"cost": "94.60"},
            "property_tax": {"cost": "156.00"},
            "insurance": {"cost": "112.75"},
            "waste": {
                "cost": "298.57",
                "lines": [
                    {
                        "bin_id": "1",
                        "bin_size": "120 L Restmüll",
                        "share_n": 2,
                        "std_count": 26,
                        "extra_count": 0,
                        "total_emptyings": 26,
                        "emptyings": [{"count": 26, "description": "Standardleerung", "price_per_emptying": "5.76", "amount": "149.76"}],
                        "extra_emptyings": [],
                    },
                    {
                        "bin_id": "2",
                        "bin_size": "240 L Bioabfall",
                        "share_n": 4,
                        "std_count": 52,
                        "extra_count": 0,
                        "total_emptyings": 52,
                        "emptyings": [{"count": 52, "description": "Standardleerung", "price_per_emptying": "2.86", "amount": "148.72"}],
                        "extra_emptyings": [],
                    },
                ],
            },
        },
    }

    tmp = os.path.join(settings.UPLOAD_DIR, f"demo_{uuid.uuid4().hex[:8]}.pdf")
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

    from app.models.settings import BuildingSettings as _BS
    bs_res = await db.execute(select(_BS).limit(1))
    bs = bs_res.scalar_one_or_none()

    success = generate_billing_pdf(
        demo_data, tmp,
        house_address=bs.house_address or "" if bs else "",
        owner_name=bs.owner_name or "" if bs else "",
        rental_address=bs.rental_address or "" if bs else "",
        bank_name=bs.bank_name or "" if bs else "",
        bank_iban=bs.bank_iban or "" if bs else "",
        bank_bic=bs.bank_bic or "" if bs else "",
        bank_account_holder=bs.bank_account_holder or "" if bs else "",
    )
    if not success:
        raise HTTPException(status_code=500, detail="Demo-PDF-Generierung fehlgeschlagen")
    return FileResponse(path=tmp, filename="demo_abrechnung_OG_2025.pdf", media_type="application/pdf")


@router.get("", response_model=List[BillingPeriodResponse])
async def list_billing_periods(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    result = await db.execute(select(BillingPeriod).order_by(BillingPeriod.year.desc()))
    return result.scalars().all()


@router.post("/calculate", response_model=BillingPeriodResponse)
async def calculate_billing(
    data: BillingCalculateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    """Calculate billing for a given year."""
    year = data.year

    # Fetch all required data
    apt_result = await db.execute(select(Apartment).order_by(Apartment.code))
    apartments = apt_result.scalars().all()

    tenancy_result = await db.execute(
        select(Tenancy).options(selectinload(Tenancy.tenant), selectinload(Tenancy.apartment))
    )
    tenancies = tenancy_result.scalars().all()

    # Confirmed and billable documents for this year (by year field or service period overlap)
    from datetime import date as _date2
    by_start = _date2(year, 1, 1)
    by_end = _date2(year, 12, 31)
    doc_result = await db.execute(
        select(Document).where(
            Document.is_billable == True,
            Document.status.in_([DocumentStatus.CONFIRMED, DocumentStatus.UPLOADED]),
            or_(
                and_(Document.year == year, Document.service_period_from == None),
                and_(
                    Document.service_period_from != None,
                    Document.service_period_to != None,
                    Document.service_period_from <= by_end,
                    Document.service_period_to >= by_start,
                ),
            )
        )
    )
    documents = doc_result.scalars().all()

    meter_result = await db.execute(
        select(MeterReading).where(MeterReading.year == year)
    )
    meter_readings = list(meter_result.scalars().all())

    # Auto-fallback: if no is_start_of_year reading exists for this year,
    # use the is_end_of_year reading from the previous year as start reading.
    types_with_start = {r.meter_type for r in meter_readings if r.is_start_of_year}
    prev_result = await db.execute(
        select(MeterReading).where(
            MeterReading.year == year - 1,
            MeterReading.is_end_of_year == True,
        )
    )
    for prev_r in prev_result.scalars().all():
        if prev_r.meter_type not in types_with_start:
            # Synthesize a virtual start-of-year reading from last year's end
            from app.models.meter_reading import MeterReading as MR, METER_UNITS
            import copy
            synthetic = MR(
                id=f"synthetic_{prev_r.id}",
                apartment_id=prev_r.apartment_id,
                meter_type=prev_r.meter_type,
                reading_date=prev_r.reading_date,
                value=prev_r.value,
                unit=prev_r.unit,
                year=year,
                is_start_of_year=True,
                is_end_of_year=False,
                is_intermediate=False,
            )
            meter_readings.append(synthetic)

    # Build bin_mappings: bin_id -> list of apt_codes
    # Only mappings valid during the billing year are considered
    from datetime import date as _date
    year_start = _date(year, 1, 1)
    year_end = _date(year, 12, 31)
    bin_result = await db.execute(
        select(WasteBinMapping).where(
            WasteBinMapping.valid_from <= year_end,
            (WasteBinMapping.valid_to == None) | (WasteBinMapping.valid_to >= year_start),
        )
    )
    bin_mappings_raw = bin_result.scalars().all()
    bin_mappings: dict = {}
    for bm in bin_mappings_raw:
        apt = next((a for a in apartments if a.id == bm.apartment_id), None)
        if apt:
            normalized_id = bm.bin_id.lstrip("0") or bm.bin_id
            if normalized_id not in bin_mappings:
                bin_mappings[normalized_id] = []
            if apt.code not in bin_mappings[normalized_id]:
                bin_mappings[normalized_id].append(apt.code)

    # Serialize data for calculator
    apt_dicts = [
        {
            "id": a.id, "code": a.code,
            "has_washer_meter": a.has_washer_meter,
            "has_zenner_meter": a.has_zenner_meter,
            "is_owner_occupied": a.is_owner_occupied,
            "heating_share_factor": a.heating_share_factor,
            "tax_share_factor": a.tax_share_factor,
            "area_sqm": a.area_sqm,
        }
        for a in apartments
    ]

    tenancy_dicts = [
        {
            "id": t.id,
            "apartment_id": t.apartment_id,
            "tenant_id": t.tenant_id,
            "start_date": t.start_date,
            "end_date": t.end_date,
            "monthly_advance_payment": str(t.monthly_advance_payment),
        }
        for t in tenancies
    ]

    doc_dicts = [
        {
            "id": d.id,
            "document_type": d.document_type,
            "total_amount": str(d.total_amount) if d.total_amount else None,
            "bill_total_kwh": str(d.bill_total_kwh) if d.bill_total_kwh else None,
            "rainwater_amount": str(d.rainwater_amount) if d.rainwater_amount else None,
            "wastewater_amount": str(d.wastewater_amount) if d.wastewater_amount else None,
            "is_billable": d.is_billable,
            "service_period_from": d.service_period_from,
            "service_period_to": d.service_period_to,
            "ai_json": d.ai_json,
            "status": d.status,
        }
        for d in documents
    ]

    reading_dicts = [
        {
            "id": r.id,
            "apartment_id": r.apartment_id,
            "meter_type": r.meter_type,
            "reading_date": r.reading_date,
            "value": str(r.value),
            "year": r.year,
            "is_start_of_year": r.is_start_of_year,
            "is_end_of_year": r.is_end_of_year,
            "is_intermediate": r.is_intermediate,
            "is_replacement_start": r.is_replacement_start,
        }
        for r in meter_readings
    ]

    def _json_safe(obj):
        """Recursively convert Decimal/date/datetime to JSON-safe types."""
        from datetime import date as _d, datetime as _dt
        if isinstance(obj, Decimal):
            return str(obj)
        if isinstance(obj, (_d, _dt)):
            return obj.isoformat()
        if isinstance(obj, dict):
            return {k: _json_safe(v) for k, v in obj.items()}
        if isinstance(obj, (list, tuple)):
            return [_json_safe(i) for i in obj]
        return obj

    # Run calculation
    calculator = BillingCalculator(
        factor_min=settings.BILLING_FACTOR_MIN,
        factor_max=settings.BILLING_FACTOR_MAX,
    )
    calc_result = calculator.calculate(
        year=year,
        apartments=apt_dicts,
        tenancies=tenancy_dicts,
        documents=doc_dicts,
        meter_readings=reading_dicts,
        bin_mappings=bin_mappings,
    )

    # Serialize result (Decimal → str, date → isoformat)
    calc_result_safe = _json_safe(calc_result)

    # Upsert billing period
    existing = await db.execute(select(BillingPeriod).where(BillingPeriod.year == year))
    period = existing.scalar_one_or_none()
    if not period:
        period = BillingPeriod(year=year)
        db.add(period)
    period.status = BillingStatus.CALCULATED
    period.calculation_data = calc_result_safe
    period.warnings = calc_result_safe.get("warnings", [])
    period.generated_at = datetime.now(timezone.utc)
    period.generated_by = current_user.id
    await db.flush()

    # Delete old per-apartment billings so we can recreate (handles tenant-count changes)
    old_abs_result = await db.execute(
        select(ApartmentBilling).where(ApartmentBilling.billing_period_id == period.id)
    )
    for old_ab in old_abs_result.scalars().all():
        await db.delete(old_ab)
    await db.flush()

    # Create one ApartmentBilling per billing entry (list, supports multiple per apartment)
    for apt_data in calc_result_safe.get("per_apartment", []):
        code = apt_data.get("apartment_code")
        apt = next((a for a in apartments if a.code == code), None)
        if not apt:
            continue

        ab = ApartmentBilling(
            billing_period_id=period.id,
            apartment_id=apt.id,
        )
        db.add(ab)
        ab.tenancy_id = apt_data.get("tenancy_id")
        ab.tenant_id = apt_data.get("tenant_id")
        ab.cost_breakdown = apt_data.get("cost_breakdown", {})
        ab.total_costs = Decimal(str(apt_data.get("total_costs", "0")))
        ab.advance_payments = Decimal(str(apt_data.get("advance_payments", "0")))
        ab.balance = Decimal(str(apt_data.get("balance", "0")))
        ab.calculation_details = apt_data

    await log_action(
        db, "BILLING_CALCULATE",
        user_id=current_user.id,
        entity_type="billing_period",
        entity_id=str(year),
        details={"year": year, "warnings": calc_result.get("warnings", [])}
    )

    return period


@router.get("/{period_id}/apartments", response_model=List[ApartmentBillingResponse])
async def list_apartment_billings(
    period_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    result = await db.execute(
        select(ApartmentBilling)
        .options(
            selectinload(ApartmentBilling.apartment),
            selectinload(ApartmentBilling.tenant),
        )
        .where(ApartmentBilling.billing_period_id == period_id)
    )
    billings = result.scalars().all()

    # Get billing period year
    period_result = await db.execute(select(BillingPeriod).where(BillingPeriod.id == period_id))
    period = period_result.scalar_one_or_none()

    responses = []
    for ab in billings:
        r = ApartmentBillingResponse.model_validate(ab)
        r.apartment_code = ab.apartment.code if ab.apartment else None
        r.tenant_name = ab.tenant.name if ab.tenant else None
        r.year = period.year if period else None
        if ab.calculation_details:
            r.tenancy_start = ab.calculation_details.get("tenancy_start")
            r.tenancy_end = ab.calculation_details.get("tenancy_end")
        responses.append(r)
    return responses


@router.post("/{period_id}/apartments/{ab_id}/generate-pdf")
async def generate_apartment_pdf(
    period_id: str,
    ab_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    """Generate PDF for an apartment billing."""
    ab_result = await db.execute(
        select(ApartmentBilling)
        .options(
            selectinload(ApartmentBilling.apartment),
            selectinload(ApartmentBilling.tenant),
            selectinload(ApartmentBilling.billing_period),
        )
        .where(ApartmentBilling.id == ab_id)
    )
    ab = ab_result.scalar_one_or_none()
    if not ab:
        raise HTTPException(status_code=404, detail="Abrechnung nicht gefunden")

    year = ab.billing_period.year if ab.billing_period else "?"

    # Build PDF data
    pdf_data = {
        "year": year,
        "apartment_code": ab.apartment.code if ab.apartment else "?",
        "tenant_name": ab.tenant.name if ab.tenant else "Mieter",
        "total_costs": str(ab.total_costs),
        "advance_payments": str(ab.advance_payments),
        "balance": str(ab.balance),
        "cost_breakdown": ab.cost_breakdown or {},
    }

    if ab.calculation_details:
        pdf_data["tenancy_start"] = str(ab.calculation_details.get("tenancy_start", ""))
        pdf_data["tenancy_end"] = str(ab.calculation_details.get("tenancy_end", ""))

    filename = f"abrechnung_{year}_{ab.apartment.code if ab.apartment else 'x'}_{ab_id[:8]}.pdf"
    output_path = os.path.join(settings.UPLOAD_DIR, filename)

    # Load bank/address settings
    from app.models.settings import BuildingSettings
    bs_res = await db.execute(select(BuildingSettings).limit(1))
    bs = bs_res.scalar_one_or_none()

    success = generate_billing_pdf(
        pdf_data, output_path,
        house_address=bs.house_address or "" if bs else "",
        owner_name=bs.owner_name or "" if bs else "",
        rental_address=bs.rental_address or "" if bs else "",
        bank_name=bs.bank_name or "" if bs else "",
        bank_iban=bs.bank_iban or "" if bs else "",
        bank_bic=bs.bank_bic or "" if bs else "",
        bank_account_holder=bs.bank_account_holder or "" if bs else "",
    )
    if not success:
        raise HTTPException(status_code=500, detail="PDF-Generierung fehlgeschlagen")

    ab.pdf_filename = filename
    ab.pdf_generated_at = datetime.now(timezone.utc)

    await log_action(
        db, "BILLING_PDF_GENERATED",
        user_id=current_user.id,
        entity_type="apartment_billing",
        entity_id=ab_id,
    )

    return {"message": "PDF erstellt", "filename": filename}


@router.post("/{period_id}/apartments/{ab_id}/release")
async def release_billing(
    period_id: str,
    ab_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    """Release billing to tenant (make visible in tenant portal)."""
    ab_result = await db.execute(select(ApartmentBilling).where(ApartmentBilling.id == ab_id))
    ab = ab_result.scalar_one_or_none()
    if not ab:
        raise HTTPException(status_code=404, detail="Abrechnung nicht gefunden")

    if not ab.pdf_filename:
        raise HTTPException(status_code=400, detail="Bitte zuerst PDF generieren")

    ab.is_released = True
    ab.released_at = datetime.now(timezone.utc)
    ab.released_by = current_user.id

    await log_action(
        db, "BILLING_RELEASED",
        user_id=current_user.id,
        entity_type="apartment_billing",
        entity_id=ab_id,
    )

    return {"message": "Abrechnung freigegeben"}


@router.get("/{period_id}/apartments/{ab_id}/pdf")
async def download_billing_pdf(
    period_id: str,
    ab_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    ab_result = await db.execute(
        select(ApartmentBilling)
        .options(selectinload(ApartmentBilling.apartment))
        .where(ApartmentBilling.id == ab_id)
    )
    ab = ab_result.scalar_one_or_none()
    if not ab or not ab.pdf_filename:
        raise HTTPException(status_code=404, detail="PDF nicht gefunden")

    file_path = os.path.join(settings.UPLOAD_DIR, ab.pdf_filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="PDF-Datei nicht gefunden")

    return FileResponse(path=file_path, filename=ab.pdf_filename, media_type="application/pdf")


@router.post("/{period_id}/apartments/{ab_id}/receipt")
async def generate_receipt(
    period_id: str,
    ab_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    """Generate a payment receipt PDF for a billing settlement."""
    from datetime import date as date_type

    ab_result = await db.execute(
        select(ApartmentBilling)
        .options(
            selectinload(ApartmentBilling.apartment),
            selectinload(ApartmentBilling.tenant),
            selectinload(ApartmentBilling.billing_period),
        )
        .where(ApartmentBilling.id == ab_id, ApartmentBilling.billing_period_id == period_id)
    )
    ab = ab_result.scalar_one_or_none()
    if not ab:
        raise HTTPException(status_code=404, detail="Abrechnung nicht gefunden")

    payment_method = body.get("payment_method", "bar")
    payment_date_str = body.get("payment_date", "")
    notes = body.get("notes", "")
    signature_b64 = body.get("signature") or None

    try:
        payment_date = date_type.fromisoformat(payment_date_str) if payment_date_str else date_type.today()
    except Exception:
        payment_date = date_type.today()

    apt = ab.apartment
    apt_labels = {"EG": "Erdgeschoss", "OG": "Obergeschoss", "DG": "Dachgeschoss", "DU": "Büro"}
    apt_label = apt_labels.get(apt.code, apt.name or apt.code or "-") if apt else "-"

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    receipt_filename = f"receipt_{ab.id}.pdf"
    output_path = os.path.join(settings.UPLOAD_DIR, receipt_filename)

    from app.services.billing_receipt_pdf import generate_billing_receipt_pdf
    signed_at = datetime.now(timezone.utc) if signature_b64 else None
    success = generate_billing_receipt_pdf(
        output_path=output_path,
        year=ab.billing_period.year if ab.billing_period else 0,
        apartment_code=apt.code if apt else "-",
        apartment_label=apt_label,
        tenant_name=ab.tenant.name if ab.tenant else "-",
        total_costs=ab.total_costs,
        advance_payments=ab.advance_payments,
        balance=ab.balance,
        payment_method=payment_method,
        payment_date=payment_date,
        notes=notes,
        signature_b64=signature_b64,
        signed_at=signed_at,
    )
    if not success:
        raise HTTPException(status_code=500, detail="Quittung konnte nicht erstellt werden")

    ab.receipt_filename = receipt_filename
    ab.receipt_generated_at = datetime.now(timezone.utc)
    ab.receipt_payment_method = payment_method
    ab.receipt_payment_date = payment_date
    await db.commit()

    year = ab.billing_period.year if ab.billing_period else "?"
    apt_code = apt.code if apt else "apt"
    return FileResponse(
        path=output_path,
        filename=f"Quittung_{year}_{apt_code}.pdf",
        media_type="application/pdf",
    )


@router.get("/{period_id}/apartments/{ab_id}/receipt")
async def download_receipt(
    period_id: str,
    ab_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    ab_result = await db.execute(select(ApartmentBilling).where(ApartmentBilling.id == ab_id))
    ab = ab_result.scalar_one_or_none()
    if not ab or not ab.receipt_filename:
        raise HTTPException(status_code=404, detail="Quittung nicht gefunden")
    path = os.path.join(settings.UPLOAD_DIR, ab.receipt_filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Datei nicht gefunden")
    return FileResponse(path=path, filename=f"Quittung_{ab.receipt_filename}", media_type="application/pdf")


@router.get("/years")
async def list_billing_years(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    result = await db.execute(select(BillingPeriod.year).order_by(BillingPeriod.year.desc()))
    return {"years": [r[0] for r in result.all()]}
