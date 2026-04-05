from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.deps import get_current_admin
from app.models.user import User
from app.models.meter_reading import MeterReading, MeterType, METER_UNITS
from app.models.apartment import Apartment
from app.models.settings import BuildingSettings
from app.schemas.meter_reading import MeterReadingCreate, MeterReadingUpdate, MeterReadingResponse

router = APIRouter(prefix="/meter-readings", tags=["admin-meter-readings"])


@router.post("/scan-image")
async def scan_meter_image(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    """
    Analyze a meter photo with GPT-4o Vision.
    Returns: { detected_value, confidence, method,
               detected_meter_type, matched_apartment_id, matched_meter_type, detected_meter_number }
    """
    import re, base64, logging, json as _json, io, uuid, os
    from app.core.config import settings

    logger = logging.getLogger(__name__)

    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Nur Bilddateien erlaubt (JPG, PNG, HEIC …)")

    contents = await file.read()
    if len(contents) > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Bild zu groß (max. 20 MB)")

    if not settings.OPENAI_API_KEY or not settings.AI_ENABLED:
        raise HTTPException(status_code=503, detail="KI-Analyse nicht konfiguriert (kein API-Key)")

    # ── Load all apartment meter serial numbers from DB ───────
    apt_result = await db.execute(select(Apartment))
    all_apartments = apt_result.scalars().all()

    meter_lookup: dict[str, tuple[str, str, str]] = {}
    for apt in all_apartments:
        if apt.water_meter_id and apt.water_meter_id.strip():
            meter_lookup[apt.water_meter_id.strip()] = (apt.id, apt.code, "water_apartment")
        if apt.washer_meter_id and apt.washer_meter_id.strip():
            meter_lookup[apt.washer_meter_id.strip()] = (apt.id, apt.code, "water_washer")
        if apt.zenner_meter_id and apt.zenner_meter_id.strip():
            # Für Eigentümer-Wohnungen: zenner_meter_id enthält die Gaszähler-Nr. (m³)
            meter_type = "gas_apartment" if apt.is_owner_occupied else "zenner_heat"
            meter_lookup[apt.zenner_meter_id.strip()] = (apt.id, apt.code, meter_type)

    # ── Load main meter serial numbers from building settings ─
    bs_result = await db.execute(select(BuildingSettings).limit(1))
    bs = bs_result.scalar_one_or_none()
    if bs:
        if bs.water_main_meter_id and bs.water_main_meter_id.strip():
            meter_lookup[bs.water_main_meter_id.strip()] = (None, "HAUS", "water_main")
        if bs.gas_main_meter_id and bs.gas_main_meter_id.strip():
            meter_lookup[bs.gas_main_meter_id.strip()] = (None, "HAUS", "gas_main")
        if bs.electricity_common_meter_id and bs.electricity_common_meter_id.strip():
            meter_lookup[bs.electricity_common_meter_id.strip()] = (None, "HAUS", "electricity_common")

    meter_list_str = "\n".join(
        f'  - "{mid}" → Wohnung {code}, {mtype}'
        for mid, (_, code, mtype) in meter_lookup.items()
    ) or "  (keine hinterlegt)"

    # ── Convert image to JPEG (handles HEIC, WEBP, PNG, …) ───
    try:
        from PIL import Image as _PIL
        pil_img = _PIL.open(io.BytesIO(contents)).convert("RGB")
        buf = io.BytesIO()
        pil_img.save(buf, format="JPEG", quality=95)
        jpeg_bytes = buf.getvalue()
    except Exception as e:
        logger.warning(f"Image conversion failed, using raw: {e}")
        jpeg_bytes = contents

    # ── Save photo to disk ────────────────────────────────────
    saved_photo_filename: Optional[str] = None
    try:
        photo_dir = os.path.join(settings.UPLOAD_DIR, "meter-photos")
        os.makedirs(photo_dir, exist_ok=True)
        saved_photo_filename = f"{uuid.uuid4()}.jpg"
        with open(os.path.join(photo_dir, saved_photo_filename), "wb") as f:
            f.write(jpeg_bytes)
    except Exception as e:
        logger.warning(f"Could not save meter photo: {e}")

    b64 = base64.b64encode(jpeg_bytes).decode()

    detected_value: Optional[float] = None
    method = "none"
    detected_meter_type: Optional[str] = None
    matched_apartment_id: Optional[str] = None
    matched_meter_type: Optional[str] = None
    detected_meter_number: Optional[str] = None

    VALID_METER_TYPES = ["water_apartment", "water_washer", "water_main", "zenner_heat", "gas_main", "gas_apartment", "electricity_common"]

    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

        prompt = (
            "You are reading a German utility meter photo.\n"
            "Answer these three questions. Use exactly this format, one line each:\n\n"
            "VALUE: [whole number ONLY — the digits shown BEFORE the comma/decimal point]\n"
            "SERIAL: [meter serial number printed on the label, e.g. 12345678, or NONE]\n"
            "TYPE: [one of: water_apartment, water_washer, water_main, zenner_heat, gas_main, electricity_common, or UNKNOWN]\n\n"
            "IMPORTANT for VALUE — this applies to ALL meter types (water, gas, heat, electricity):\n"
            "German meters have a decimal separator (comma or red section). "
            "The main reading is the BLACK/WHITE digits BEFORE the comma. "
            "The digits AFTER the comma (often printed in RED or in a red box) are decimal fractions — IGNORE them completely. "
            "Report ONLY the integer part before the comma. No decimal point, no comma in your answer. "
            "Strip leading zeros. Example: display shows '00057,348' → VALUE: 57\n\n"
            f"Known serial numbers: {', '.join(meter_lookup.keys()) or 'none'}\n\n"
            "Reply with exactly 3 lines starting with VALUE:, SERIAL:, TYPE:"
        )

        resp = await client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}", "detail": "high"}},
                ],
            }],
            max_tokens=100,
            temperature=0,
        )
        ai_text = resp.choices[0].message.content.strip()
        print(f"[SCAN] {ai_text!r}", flush=True)

        # Parse line-based response
        for line in ai_text.splitlines():
            line = line.strip()

            if line.upper().startswith("VALUE:"):
                raw = line.split(":", 1)[1].strip()
                # Truncate at comma or decimal point — only keep the integer part
                # e.g. "57,348" → "57", "57.348" → "57", "00057" → "57"
                integer_part = re.split(r"[,.]", raw)[0]
                nums = re.findall(r"\d+", integer_part)
                if nums:
                    try:
                        v = int(nums[0].lstrip("0") or "0")
                        if 0 < v < 999999:
                            detected_value = float(v)
                            method = "ai_vision"
                    except ValueError:
                        pass

            elif line.upper().startswith("SERIAL:"):
                raw = line.split(":", 1)[1].strip()
                if raw.upper() != "NONE" and raw:
                    detected_meter_number = raw

                    def _norm(s: str) -> str:
                        return re.sub(r"[\s\-]", "", s).lstrip("0") or "0"

                    # 1. Exact match
                    match_result = meter_lookup.get(detected_meter_number)
                    if not match_result:
                        # 2. Normalized exact (strip spaces/dashes/leading zeros)
                        norm_det = _norm(detected_meter_number)
                        norm_map = {_norm(k): v for k, v in meter_lookup.items()}
                        match_result = norm_map.get(norm_det)
                    if not match_result:
                        # 3. Fuzzy match via difflib (tolerates 1-2 misread digits)
                        import difflib
                        norm_det = _norm(detected_meter_number)
                        norm_map = {_norm(k): v for k, v in meter_lookup.items()}
                        close = difflib.get_close_matches(norm_det, norm_map.keys(), n=1, cutoff=0.82)
                        if close:
                            match_result = norm_map[close[0]]
                    print(f"[MATCH] det={detected_meter_number!r} result={match_result}", flush=True)
                    if match_result:
                        matched_apartment_id, _, matched_meter_type = match_result

            elif line.upper().startswith("TYPE:"):
                raw = line.split(":", 1)[1].strip().lower()
                if not matched_meter_type and raw in VALID_METER_TYPES:
                    detected_meter_type = raw

    except Exception as e:
        logger.error(f"[SCAN] failed: {type(e).__name__}: {e}")

    confidence = "high" if method == "ai_vision" else "none"
    print(f"[RESULT] value={detected_value} apt={matched_apartment_id} type={matched_meter_type or detected_meter_type}", flush=True)

    return {
        "detected_value": detected_value,
        "confidence": confidence,
        "method": method,
        "raw_text": "",
        "detected_meter_type": matched_meter_type or detected_meter_type,
        "matched_apartment_id": matched_apartment_id,
        "matched_meter_type": matched_meter_type,
        "detected_meter_number": detected_meter_number,
        "photo_filename": saved_photo_filename,
    }


@router.get("", response_model=List[MeterReadingResponse])
async def list_meter_readings(
    year: Optional[int] = Query(None),
    apartment_id: Optional[str] = Query(None),
    meter_type: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    query = select(MeterReading).order_by(MeterReading.reading_date.desc())
    if year:
        query = query.where(MeterReading.year == year)
    if apartment_id:
        query = query.where(MeterReading.apartment_id == apartment_id)
    if meter_type:
        query = query.where(MeterReading.meter_type == meter_type)

    result = await db.execute(query)
    readings = result.scalars().all()

    # Enrich with apartment code
    responses = []
    for r in readings:
        resp = MeterReadingResponse.model_validate(r)
        if r.apartment_id:
            apt_result = await db.execute(select(Apartment).where(Apartment.id == r.apartment_id))
            apt = apt_result.scalar_one_or_none()
            resp.apartment_code = apt.code if apt else None
        responses.append(resp)
    return responses


@router.post("", response_model=MeterReadingResponse, status_code=status.HTTP_201_CREATED)
async def create_meter_reading(
    data: MeterReadingCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    # Validate: no backwards readings (skip for replacement start – new meter starts at 0)
    if data.apartment_id and not data.is_replacement_start:
        prev = await db.execute(
            select(MeterReading)
            .where(
                MeterReading.apartment_id == data.apartment_id,
                MeterReading.meter_type == data.meter_type,
                MeterReading.reading_date < data.reading_date,
            )
            .order_by(MeterReading.reading_date.desc())
            .limit(1)
        )
        prev_reading = prev.scalar_one_or_none()
        if prev_reading and not prev_reading.is_replacement_start and data.value < prev_reading.value:
            raise HTTPException(
                status_code=400,
                detail=f"Zählerstand rückläufig! Vorheriger Wert: {prev_reading.value} am {prev_reading.reading_date}"
            )

    reading = MeterReading(
        apartment_id=data.apartment_id,
        meter_type=data.meter_type,
        reading_date=data.reading_date,
        value=data.value,
        unit=METER_UNITS.get(data.meter_type, ""),
        year=data.year or data.reading_date.year,
        is_start_of_year=data.is_start_of_year,
        is_end_of_year=data.is_end_of_year,
        is_intermediate=data.is_intermediate,
        is_replacement_start=data.is_replacement_start,
        meter_serial=data.meter_serial,
        reading_by=current_user.id,
        notes=data.notes,
        photo_filename=data.photo_filename,
    )
    db.add(reading)
    await db.flush()
    return reading


@router.get("/photo/{filename}")
async def get_meter_photo(
    filename: str,
):
    """Serve a saved meter photo (no auth required – UUIDs are not guessable)."""
    import os, re
    from fastapi.responses import FileResponse
    from app.core.config import settings
    # Security: only allow safe filenames (UUID.jpg)
    if not re.match(r"^[0-9a-f\-]{36}\.jpg$", filename):
        raise HTTPException(status_code=400, detail="Ungültiger Dateiname")
    path = os.path.join(settings.UPLOAD_DIR, "meter-photos", filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Foto nicht gefunden")
    return FileResponse(path, media_type="image/jpeg")


@router.put("/{reading_id}", response_model=MeterReadingResponse)
async def update_meter_reading(
    reading_id: str,
    data: MeterReadingUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    result = await db.execute(select(MeterReading).where(MeterReading.id == reading_id))
    reading = result.scalar_one_or_none()
    if not reading:
        raise HTTPException(status_code=404, detail="Zählerstand nicht gefunden")

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(reading, field, value)
    return reading


@router.delete("/{reading_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_meter_reading(
    reading_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    result = await db.execute(select(MeterReading).where(MeterReading.id == reading_id))
    reading = result.scalar_one_or_none()
    if not reading:
        raise HTTPException(status_code=404, detail="Zählerstand nicht gefunden")
    await db.delete(reading)


@router.get("/summary/{year}")
async def meter_reading_summary(
    year: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    """Get all meter readings for a year grouped by apartment."""
    result = await db.execute(
        select(MeterReading)
        .where(MeterReading.year == year)
        .order_by(MeterReading.apartment_id, MeterReading.meter_type, MeterReading.reading_date)
    )
    readings = result.scalars().all()

    # Get apartments
    apt_result = await db.execute(select(Apartment).order_by(Apartment.code))
    apartments = {a.id: a.code for a in apt_result.scalars().all()}

    summary = {}
    for r in readings:
        code = apartments.get(r.apartment_id, "HAUPT") if r.apartment_id else "HAUPT"
        if code not in summary:
            summary[code] = {}
        if r.meter_type not in summary[code]:
            summary[code][r.meter_type] = []
        summary[code][r.meter_type].append({
            "id": r.id,
            "date": str(r.reading_date),
            "value": str(r.value),
            "unit": r.unit,
            "is_start": r.is_start_of_year,
            "is_end": r.is_end_of_year,
            "is_intermediate": r.is_intermediate,
            "is_replacement_start": r.is_replacement_start,
            "meter_serial": r.meter_serial,
        })

    return summary
