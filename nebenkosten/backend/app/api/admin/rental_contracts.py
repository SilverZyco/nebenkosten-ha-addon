import json
import os
from datetime import datetime, timezone
from decimal import Decimal
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.deps import get_current_admin
from app.core.config import settings
from app.models.user import User
from app.models.rental_contract import RentalContract, RentalContractStatus
from app.models.apartment import Apartment
from app.schemas.rental_contract import (
    RentalContractCreate, RentalContractUpdate, RentalContractResponse
)

router = APIRouter(prefix="/rental-contracts", tags=["admin-rental-contracts"])


def get_default_paragraph_texts(
    tenant_name: str = "Mieter",
    floor_label: str = "Wohnung",
    area_str: str = "– m²",
    start_date_str: str = "–",
    monthly_rent_str: str = "–",
    advance_payment_str: str = "–",
    kitchen_str: str = "entfällt",
    total_warm_str: str = "–",
    deposit_str: str = "–",
    has_kitchen: bool = False,
    deposit_months: int = 3,
) -> dict:
    kitchen_para = (
        f"Für die Mitbenutzung der Einbauküche wird ein gesondertes Entgelt von {kitchen_str} monatlich vereinbart. "
        f"Dieses Entgelt ist zusammen mit der Miete fällig."
    ) if has_kitchen else "Eine Einbauküche ist nicht Gegenstand dieses Mietvertrages."

    _months_word = {1: "einer", 2: "zwei", 3: "drei", 4: "vier", 5: "fünf", 6: "sechs"}.get(deposit_months, str(deposit_months))
    _plural = "n" if deposit_months != 1 else ""

    return {
        "p1": (
            f"Der Vermieter vermietet an den Mieter die Wohnung im {floor_label} des Hauses Hauptstraße 15, 66802 Überherrn. "
            f"Die Wohnfläche beträgt ca. {area_str}. "
            f"Zur Wohnung gehören: Flur, Wohnzimmer, Schlafzimmer, Küche, Bad/WC sowie ein Kellerabteil. "
            f"Der Mieter ist berechtigt, den gemeinschaftlichen Garten und die Gemeinschaftsflächen mitzubenutzen."
        ),
        "p2": (
            f"Das Mietverhältnis beginnt am {start_date_str} und wird auf unbestimmte Zeit geschlossen. "
            f"Eine Befristung ist nicht vereinbart."
        ),
        "p3": (
            f"Die monatliche Kaltmiete beträgt {monthly_rent_str}. "
            f"Zusätzlich ist eine monatliche Vorauszahlung auf die Betriebskosten (Nebenkosten) in Höhe von {advance_payment_str} zu entrichten. "
            f"{kitchen_para} "
            f"Die Gesamtmiete beläuft sich somit auf {total_warm_str} monatlich."
        ),
        "p4": (
            "Die Miete ist monatlich im Voraus, spätestens am 3. Werktag eines jeden Monats, auf das Konto des Vermieters zu überweisen. "
            "Der Verwendungszweck soll die Wohnungsbezeichnung und den Monat enthalten. "
            "Bei Zahlung durch Dauerauftrag hat der Mieter dafür zu sorgen, dass die Gutschrift rechtzeitig erfolgt."
        ),
        "p5": (
            f"Der Mieter leistet eine Sicherheitskaution in Höhe von {deposit_str} "
            f"(entspricht {_months_word} Monatskaltmiete{_plural}). "
            f"Die Kaution ist spätestens bei Beginn des Mietverhältnisses in voller Höhe zu entrichten. "
            "Der Vermieter legt die Kaution bei einem Kreditinstitut zu den für Spareinlagen mit dreimonatiger Kündigungsfrist "
            "üblichen Konditionen getrennt von seinem Vermögen an."
        ),
        "p6": (
            "Der Mieter trägt anteilig die anfallenden Betriebskosten gemäß Betriebskostenverordnung (BetrKV). "
            "Hierzu zählen insbesondere: Wasser/Abwasser, Müllentsorgung, Gebäudeversicherung, Grundsteuer, "
            "Niederschlagswassergebühr, Allgemeinstrom sowie Schornsteinfegerkosten. "
            "Über die geleisteten Vorauszahlungen wird jährlich abgerechnet. "
            "Etwaige Nachzahlungen oder Guthaben werden dem Mieter innerhalb von 12 Monaten nach Ende des Abrechnungszeitraums mitgeteilt."
        ),
        "p7": (
            "Der Mieter erhält die erforderlichen Schlüssel für Wohnungstür, Haustür und Keller. "
            "Bei Verlust eines Schlüssels trägt der Mieter die Kosten für die Wiederbeschaffung. "
            "Die Anfertigung von Schlüsseln bedarf der schriftlichen Zustimmung des Vermieters. "
            "Alle Schlüssel sind bei Auszug vollständig zurückzugeben."
        ),
        "p8": (
            "Der Mieter ist verpflichtet, Schönheitsreparaturen während der Mietzeit nach Bedarf durchzuführen und "
            "die Wohnung bei Auszug in einem ordnungsgemäßen Zustand zurückzugeben. "
            "Zu den Schönheitsreparaturen zählen insbesondere das Streichen und Tapezieren von Wänden und Decken "
            "sowie die Pflege der Fußböden. Farbwahl und Ausführungsart bedürfen bei Veränderungen der Zustimmung des Vermieters."
        ),
        "p9": (
            "Der Vermieter trägt die Kosten für die Instandhaltung der Mietsache, soweit nicht der Mieter die Schäden verursacht hat. "
            "Kleinreparaturen bis zu einem Betrag von 100,00 € je Einzelreparatur, maximal jedoch 8 % der Jahresnettomiete, "
            "trägt der Mieter. Der Mieter hat Mängel unverzüglich schriftlich oder in Textform dem Vermieter anzuzeigen."
        ),
        "p10": (
            "Der Mieter ist verpflichtet, die Wohnung angemessen zu lüften und zu heizen, "
            "um Feuchtigkeit und Schimmelbildung zu vermeiden. Mindestens dreimal täglich ist stoßzulüften (Querlüftung). "
            "Bei längerer Abwesenheit sind die notwendigen Maßnahmen zum Schutz der Wohnung vor Frost und Schimmel zu ergreifen. "
            "Für durch mangelhaftes Lüften entstandene Schäden haftet der Mieter."
        ),
        "p11": (
            "Die Haltung von Kleintieren (z.B. Hamster, Vögel, Zierfische) ist gestattet. "
            "Die Haltung von Hunden und Katzen bedarf der ausdrücklichen schriftlichen Zustimmung des Vermieters. "
            "Diese kann aus sachlichem Grund verweigert oder widerrufen werden."
        ),
        "p12": (
            "In der Wohnung sowie in allen Gemeinschaftsflächen des Hauses ist das Rauchen nicht gestattet. "
            "Bei Nichtbeachtung haftet der Mieter für alle durch das Rauchen entstandenen Schäden an der Mietsache."
        ),
        "p13": (
            "Eine Untervermietung der Wohnung oder von Teilen davon ist ohne vorherige schriftliche Zustimmung des Vermieters "
            "nicht zulässig. Bei unerlaubter Untervermietung kann der Vermieter das Mietverhältnis außerordentlich kündigen."
        ),
        "p14": (
            "Dem Mieter wird das Recht zur Mitbenutzung des Gartens und der Gemeinschaftsflächen eingeräumt. "
            "Die Nutzung erfolgt auf eigene Gefahr. Veränderungen im Garten (Neuanpflanzungen, bauliche Maßnahmen) bedürfen "
            "der schriftlichen Zustimmung des Vermieters. Der Mieter ist verpflichtet, "
            "die Gemeinschaftsflächen sauber und ordentlich zu halten."
        ),
        "p15": (
            "In der Wohnung sind Rauchwarnmelder installiert. Der Mieter ist verpflichtet, "
            "die Funktionsfähigkeit der Rauchwarnmelder regelmäßig zu überprüfen und den Vermieter unverzüglich zu informieren, "
            "falls ein Gerät defekt ist. Das Entfernen oder Deaktivieren von Rauchwarnmeldern ist untersagt."
        ),
        "p16": (
            "Der Mieter verpflichtet sich, die Hausordnung in ihrer jeweils gültigen Fassung zu beachten. "
            "Sie ist Bestandteil dieses Mietvertrages. Die Hausordnung regelt insbesondere Ruhezeiten, Reinigungspflichten "
            "und die Nutzung der Gemeinschaftsflächen. Mittagsruhe ist von 13:00 bis 15:00 Uhr, "
            "Nachtruhe von 22:00 bis 07:00 Uhr einzuhalten."
        ),
        "p17": (
            "Das Mietverhältnis kann vom Mieter mit einer Frist von drei Monaten zum Monatsende schriftlich gekündigt werden. "
            "Der Vermieter kann das Mietverhältnis nur aus den gesetzlich vorgesehenen Gründen kündigen. "
            "Die Kündigung bedarf der Schriftform und ist an die Vertragsparteien zu richten."
        ),
        "p18": (
            "Zu Beginn des Mietverhältnisses wird ein Übergabeprotokoll erstellt, in dem der Zustand der Wohnung sowie "
            "die Zählerstände dokumentiert werden. Bei Beendigung des Mietverhältnisses ist die Wohnung besenrein und "
            "in ordnungsgemäßem Zustand zurückzugeben. Einbauten des Mieters sind bei Auszug zu entfernen, "
            "sofern der Vermieter nicht ausdrücklich deren Verbleib wünscht."
        ),
        "p19": (
            "Der Vermieter verarbeitet personenbezogene Daten des Mieters ausschließlich zur Durchführung des Mietvertrages "
            "und zur Erfüllung gesetzlicher Pflichten. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO. "
            "Die Daten werden nicht an Dritte weitergegeben, soweit dies nicht zur Vertragsabwicklung erforderlich ist "
            "(z.B. Abrechnung der Betriebskosten). Der Mieter hat das Recht auf Auskunft, Berichtigung, Löschung "
            "und Widerspruch gemäß DSGVO."
        ),
        "p20": "Keine Sondervereinbarungen.",
    }


async def _enrich(contract: RentalContract, db: AsyncSession) -> RentalContractResponse:
    r = RentalContractResponse.model_validate(contract)
    if contract.apartment_id:
        res = await db.execute(select(Apartment).where(Apartment.id == contract.apartment_id))
        apt = res.scalar_one_or_none()
        if apt:
            r.apartment_code = apt.code
            r.apartment_name = apt.name
            r.apartment_area_sqm = apt.area_sqm
    if contract.tenant_user_id:
        res = await db.execute(select(User).where(User.id == contract.tenant_user_id))
        u = res.scalar_one_or_none()
        if u:
            r.tenant_user_name = u.name
    return r


@router.get("/default-paragraphs")
async def get_default_paragraphs_endpoint(
    tenant_name: str = "Mieter",
    apartment_code: str = "",
    area_sqm: float = 0,
    start_date: str = "",
    monthly_rent: float = 0,
    advance_payment: float = 0,
    kitchen_fee: float = 0,
    deposit_months: int = 3,
    _: User = Depends(get_current_admin),
):
    floor_label = {
        "EG": "Erdgeschoss",
        "OG": "Obergeschoss",
        "DG": "Dachgeschoss",
        "DU": "Büro",
    }.get(apartment_code, apartment_code or "Wohnung")

    def fmt_eur(v: float) -> str:
        from decimal import Decimal as D
        val = D(str(v))
        s = f"{val:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
        return s + " \u20ac"

    def fmt_date(s: str) -> str:
        if not s:
            return "–"
        try:
            from datetime import date
            d = date.fromisoformat(s)
            return d.strftime("%d.%m.%Y")
        except Exception:
            return s

    kitchen_str = fmt_eur(kitchen_fee) if kitchen_fee else "entfällt"
    total_warm = monthly_rent + advance_payment + (kitchen_fee or 0)
    deposit = monthly_rent * deposit_months

    paras = get_default_paragraph_texts(
        tenant_name=tenant_name,
        floor_label=floor_label,
        area_str=f"{area_sqm:.1f} m²" if area_sqm else "– m²",
        start_date_str=fmt_date(start_date),
        monthly_rent_str=fmt_eur(monthly_rent),
        advance_payment_str=fmt_eur(advance_payment),
        kitchen_str=kitchen_str,
        total_warm_str=fmt_eur(total_warm),
        deposit_str=fmt_eur(deposit),
        has_kitchen=bool(kitchen_fee),
        deposit_months=deposit_months,
    )
    return paras


@router.get("", response_model=List[RentalContractResponse])
async def list_rental_contracts(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    result = await db.execute(
        select(RentalContract).order_by(RentalContract.created_at.desc())
    )
    contracts = result.scalars().all()
    return [await _enrich(c, db) for c in contracts]


@router.post("", response_model=RentalContractResponse, status_code=201)
async def create_rental_contract(
    data: RentalContractCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    # Check for existing active (non-draft) contracts for the same apartment
    existing_res = await db.execute(
        select(RentalContract).where(
            RentalContract.apartment_id == data.apartment_id,
            RentalContract.status.in_([RentalContractStatus.SENT, RentalContractStatus.SIGNED]),
        )
    )
    if existing_res.scalar_one_or_none():
        raise HTTPException(
            status_code=400,
            detail="Es existiert bereits ein aktiver Mietvertrag (gesendet/unterschrieben) für diese Wohnung."
        )

    months = max(1, min(data.deposit_months, 6))
    deposit = (data.monthly_rent * Decimal(str(months))).quantize(Decimal("0.01"))
    paragraphs_json = json.dumps(data.contract_paragraphs) if data.contract_paragraphs else None

    contract = RentalContract(
        apartment_id=data.apartment_id,
        tenancy_id=data.tenancy_id,
        tenant_user_id=data.tenant_user_id,
        tenant_name=data.tenant_name,
        tenant_address1=data.tenant_address1,
        tenant_address2=data.tenant_address2,
        tenant_address3=data.tenant_address3,
        start_date=data.start_date,
        monthly_rent=data.monthly_rent,
        advance_payment=data.advance_payment,
        kitchen_fee=data.kitchen_fee,
        deposit=deposit,
        special_notes=data.special_notes,
        contract_paragraphs=paragraphs_json,
        has_cellar=data.has_cellar,
        deposit_months=months,
        status=RentalContractStatus.DRAFT,
    )
    db.add(contract)
    await db.flush()
    return await _enrich(contract, db)


@router.get("/{contract_id}", response_model=RentalContractResponse)
async def get_rental_contract(
    contract_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    result = await db.execute(select(RentalContract).where(RentalContract.id == contract_id))
    contract = result.scalar_one_or_none()
    if not contract:
        raise HTTPException(status_code=404, detail="Vertrag nicht gefunden")
    return await _enrich(contract, db)


@router.put("/{contract_id}", response_model=RentalContractResponse)
async def update_rental_contract(
    contract_id: str,
    data: RentalContractUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    result = await db.execute(select(RentalContract).where(RentalContract.id == contract_id))
    contract = result.scalar_one_or_none()
    if not contract:
        raise HTTPException(status_code=404, detail="Vertrag nicht gefunden")
    if contract.status != RentalContractStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Nur Entwürfe können bearbeitet werden")

    update_data = data.model_dump(exclude_none=True)

    if "contract_paragraphs" in update_data:
        contract.contract_paragraphs = json.dumps(update_data.pop("contract_paragraphs"))

    for field, value in update_data.items():
        setattr(contract, field, value)

    if "monthly_rent" in update_data or "deposit_months" in update_data:
        months = max(1, min(contract.deposit_months, 6))
        contract.deposit = (contract.monthly_rent * Decimal(str(months))).quantize(Decimal("0.01"))

    return await _enrich(contract, db)


@router.delete("/{contract_id}", status_code=204)
async def delete_rental_contract(
    contract_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    result = await db.execute(select(RentalContract).where(RentalContract.id == contract_id))
    contract = result.scalar_one_or_none()
    if not contract:
        raise HTTPException(status_code=404, detail="Vertrag nicht gefunden")

    if contract.pdf_filename:
        pdf_path = os.path.join(settings.UPLOAD_DIR, contract.pdf_filename)
        if os.path.exists(pdf_path):
            os.remove(pdf_path)

    await db.delete(contract)


@router.post("/{contract_id}/send", response_model=RentalContractResponse)
async def send_rental_contract(
    contract_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    result = await db.execute(select(RentalContract).where(RentalContract.id == contract_id))
    contract = result.scalar_one_or_none()
    if not contract:
        raise HTTPException(status_code=404, detail="Vertrag nicht gefunden")
    if contract.status != RentalContractStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Vertrag ist nicht im Entwurf-Status")
    if not contract.tenant_user_id:
        raise HTTPException(
            status_code=400,
            detail="Kein Mieter-Login zugeordnet. Bitte zuerst einen Mieter-User auswählen."
        )

    contract.status = RentalContractStatus.SENT
    return await _enrich(contract, db)


@router.post("/{contract_id}/sign-direct", response_model=RentalContractResponse)
async def sign_direct(
    contract_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    """Sign contract directly in admin portal (tenant signs in person). DRAFT → SIGNED."""
    result = await db.execute(select(RentalContract).where(RentalContract.id == contract_id))
    contract = result.scalar_one_or_none()
    if not contract:
        raise HTTPException(status_code=404, detail="Vertrag nicht gefunden")
    if contract.status not in (RentalContractStatus.DRAFT, RentalContractStatus.SENT):
        raise HTTPException(status_code=400, detail="Vertrag kann nicht mehr unterschrieben werden")

    signature_b64 = body.get("signature")
    if not signature_b64:
        raise HTTPException(status_code=400, detail="Unterschrift fehlt")

    contract.tenant_signature = signature_b64
    contract.tenant_signed_at = datetime.now(timezone.utc)
    contract.tenant_signed_ip = "admin-portal"
    contract.status = RentalContractStatus.SIGNED

    apt_result = await db.execute(select(Apartment).where(Apartment.id == contract.apartment_id))
    apt = apt_result.scalar_one_or_none()

    paragraphs = None
    if contract.contract_paragraphs:
        try:
            paragraphs = json.loads(contract.contract_paragraphs)
        except Exception:
            pass

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    filename = f"mietvertrag_{contract.id}.pdf"
    output_path = os.path.join(settings.UPLOAD_DIR, filename)

    from app.services.rental_contract_pdf import generate_rental_contract_pdf
    success = generate_rental_contract_pdf(
        output_path=output_path,
        tenant_name=contract.tenant_name,
        tenant_address1=contract.tenant_address1,
        tenant_address2=contract.tenant_address2,
        tenant_address3=contract.tenant_address3,
        apartment_code=apt.code if apt else "",
        apartment_name=apt.name if apt else "",
        apartment_area_sqm=apt.area_sqm if apt else None,
        start_date=contract.start_date,
        monthly_rent=contract.monthly_rent,
        advance_payment=contract.advance_payment,
        kitchen_fee=contract.kitchen_fee,
        deposit=contract.deposit,
        special_notes=contract.special_notes,
        contract_paragraphs=paragraphs,
        tenant_signature_b64=signature_b64,
        signed_at=contract.tenant_signed_at,
        signed_ip="Admin-Portal (vor Ort)",
        has_cellar=contract.has_cellar,
        deposit_months=contract.deposit_months,
    )
    if success:
        contract.pdf_filename = filename

    await db.commit()
    return await _enrich(contract, db)


@router.post("/{contract_id}/landlord-sign", response_model=RentalContractResponse)
async def landlord_sign_contract(
    contract_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    """Admin signs the contract after tenant has signed. Regenerates PDF with both signatures."""
    result = await db.execute(select(RentalContract).where(RentalContract.id == contract_id))
    contract = result.scalar_one_or_none()
    if not contract:
        raise HTTPException(status_code=404, detail="Vertrag nicht gefunden")
    if contract.status != RentalContractStatus.SIGNED:
        raise HTTPException(status_code=400, detail="Vertrag wurde noch nicht vom Mieter unterschrieben")

    signature_b64 = body.get("signature")
    if not signature_b64:
        raise HTTPException(status_code=400, detail="Unterschrift fehlt")

    contract.landlord_signature = signature_b64
    contract.landlord_signed_at = datetime.now(timezone.utc)

    apt_result = await db.execute(select(Apartment).where(Apartment.id == contract.apartment_id))
    apt = apt_result.scalar_one_or_none()

    paragraphs = None
    if contract.contract_paragraphs:
        try:
            paragraphs = json.loads(contract.contract_paragraphs)
        except Exception:
            pass

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    filename = f"mietvertrag_{contract.id}.pdf"
    output_path = os.path.join(settings.UPLOAD_DIR, filename)

    from app.services.rental_contract_pdf import generate_rental_contract_pdf
    success = generate_rental_contract_pdf(
        output_path=output_path,
        tenant_name=contract.tenant_name,
        tenant_address1=contract.tenant_address1,
        tenant_address2=contract.tenant_address2,
        tenant_address3=contract.tenant_address3,
        apartment_code=apt.code if apt else "",
        apartment_name=apt.name if apt else "",
        apartment_area_sqm=apt.area_sqm if apt else None,
        start_date=contract.start_date,
        monthly_rent=contract.monthly_rent,
        advance_payment=contract.advance_payment,
        kitchen_fee=contract.kitchen_fee,
        deposit=contract.deposit,
        special_notes=contract.special_notes,
        contract_paragraphs=paragraphs,
        tenant_signature_b64=contract.tenant_signature,
        signed_at=contract.tenant_signed_at,
        signed_ip=contract.tenant_signed_ip,
        landlord_signature_b64=signature_b64,
        landlord_signed_at=contract.landlord_signed_at,
        has_cellar=contract.has_cellar,
        deposit_months=contract.deposit_months,
    )
    if success:
        contract.pdf_filename = filename

    await db.commit()
    return await _enrich(contract, db)


@router.post("/{contract_id}/generate-pdf", response_model=RentalContractResponse)
async def admin_generate_pdf(
    contract_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    result = await db.execute(select(RentalContract).where(RentalContract.id == contract_id))
    contract = result.scalar_one_or_none()
    if not contract:
        raise HTTPException(status_code=404, detail="Vertrag nicht gefunden")

    apt_result = await db.execute(select(Apartment).where(Apartment.id == contract.apartment_id))
    apt = apt_result.scalar_one_or_none()

    paragraphs = None
    if contract.contract_paragraphs:
        try:
            paragraphs = json.loads(contract.contract_paragraphs)
        except Exception:
            pass

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    filename = f"mietvertrag_{contract.id}.pdf"
    output_path = os.path.join(settings.UPLOAD_DIR, filename)

    from app.services.rental_contract_pdf import generate_rental_contract_pdf
    success = generate_rental_contract_pdf(
        output_path=output_path,
        tenant_name=contract.tenant_name,
        tenant_address1=contract.tenant_address1,
        tenant_address2=contract.tenant_address2,
        tenant_address3=contract.tenant_address3,
        apartment_code=apt.code if apt else "",
        apartment_name=apt.name if apt else "",
        apartment_area_sqm=apt.area_sqm if apt else None,
        start_date=contract.start_date,
        monthly_rent=contract.monthly_rent,
        advance_payment=contract.advance_payment,
        kitchen_fee=contract.kitchen_fee,
        deposit=contract.deposit,
        special_notes=contract.special_notes,
        contract_paragraphs=paragraphs,
        tenant_signature_b64=contract.tenant_signature,
        signed_at=contract.tenant_signed_at,
        signed_ip=contract.tenant_signed_ip,
        landlord_signature_b64=contract.landlord_signature,
        landlord_signed_at=contract.landlord_signed_at,
        has_cellar=contract.has_cellar,
        deposit_months=contract.deposit_months,
    )
    if not success:
        raise HTTPException(status_code=500, detail="PDF-Generierung fehlgeschlagen")

    contract.pdf_filename = filename
    return await _enrich(contract, db)


@router.post("/demo-pdf")
async def demo_pdf(
    body: dict,
    _: User = Depends(get_current_admin),
):
    """Generate a preview/demo PDF without saving to database."""
    import tempfile
    from datetime import date

    tenant_name = body.get("tenant_name") or "Mustermann"
    apartment_code = body.get("apartment_code") or ""
    apartment_name = body.get("apartment_name") or "Musterwohnung"
    area_sqm = body.get("area_sqm")
    start_date_str = body.get("start_date") or date.today().isoformat()
    monthly_rent = Decimal(str(body.get("monthly_rent") or 0))
    advance_payment = Decimal(str(body.get("advance_payment") or 0))
    kitchen_fee = Decimal(str(body.get("kitchen_fee") or 0)) if body.get("kitchen_fee") else None
    special_notes = body.get("special_notes")
    has_cellar = body.get("has_cellar", True)
    deposit_months = int(body.get("deposit_months") or 3)
    contract_paragraphs = body.get("contract_paragraphs")

    deposit = (monthly_rent * Decimal(str(deposit_months))).quantize(Decimal("0.01"))

    try:
        start_date = date.fromisoformat(start_date_str)
    except Exception:
        start_date = date.today()

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    tmp = tempfile.NamedTemporaryFile(
        suffix=".pdf", prefix="demo_mietvertrag_",
        dir=settings.UPLOAD_DIR, delete=False
    )
    output_path = tmp.name
    tmp.close()

    from app.services.rental_contract_pdf import generate_rental_contract_pdf
    success = generate_rental_contract_pdf(
        output_path=output_path,
        tenant_name=tenant_name,
        tenant_address1=body.get("tenant_address1"),
        tenant_address2=body.get("tenant_address2"),
        tenant_address3=body.get("tenant_address3"),
        apartment_code=apartment_code,
        apartment_name=apartment_name,
        apartment_area_sqm=area_sqm,
        start_date=start_date,
        monthly_rent=monthly_rent,
        advance_payment=advance_payment,
        kitchen_fee=kitchen_fee,
        deposit=deposit,
        special_notes=special_notes,
        contract_paragraphs=contract_paragraphs,
        has_cellar=has_cellar,
        deposit_months=deposit_months,
        is_demo=True,
    )
    if not success:
        raise HTTPException(status_code=500, detail="Demo-PDF konnte nicht erstellt werden")

    return FileResponse(
        path=output_path,
        filename=f"Mietvertrag_Vorschau_{tenant_name}.pdf",
        media_type="application/pdf",
        background=None,
    )


@router.get("/{contract_id}/pdf")
async def download_pdf(
    contract_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    result = await db.execute(select(RentalContract).where(RentalContract.id == contract_id))
    contract = result.scalar_one_or_none()
    if not contract or not contract.pdf_filename:
        raise HTTPException(status_code=404, detail="PDF nicht vorhanden")

    pdf_path = os.path.join(settings.UPLOAD_DIR, contract.pdf_filename)
    if not os.path.exists(pdf_path):
        raise HTTPException(status_code=404, detail="PDF-Datei nicht gefunden")

    return FileResponse(
        path=pdf_path,
        filename=f"Mietvertrag_{contract.tenant_name}.pdf",
        media_type="application/pdf",
    )
