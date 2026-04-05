import os
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.deps import get_current_admin
from app.core.config import settings
from app.models.user import User
from app.models.apartment import Apartment
from app.models.house_document import HouseDocument, HouseDocumentStatus

router = APIRouter(prefix="/house-documents", tags=["admin-house-documents"])

DOCUMENTS_DIR = os.environ.get("DOCUMENTS_DIR", "/app/dokumente")

# Default texts per template filename
DEFAULT_TEXTS: dict = {
    "Hausordnung.odt": """Hausordnung -- Hauptstraße 15, 66802 Überherrn

1. Ruhezeiten
Mittagsruhe: 13:00-15:00 Uhr | Nachtruhe: 22:00-07:00 Uhr | Sonntags ganztägig Ruhe einhalten.

2. Reinigung
Jeder Mieter reinigt die Gemeinschaftsflächen (Treppenhaus, Keller, Hauseingang) nach Kehrwoche. Müll ist in die dafür vorgesehenen Tonnen zu entsorgen.

3. Lärm und Musik
Laute Musik, Partys und lärmende Tätigkeiten sind zu unterlassen. Handwerker dürfen werktags von 08:00-12:00 und 14:00-18:00 Uhr tätig sein.

4. Garten und Gemeinschaftsflächen
Der Garten darf gemeinschaftlich genutzt werden. Veränderungen bedürften der Zustimmung des Vermieters. Abfall ist ordnungsgemäß zu entsorgen.

5. Haustiere
Kleintiere sind erlaubt. Hunde und Katzen nur mit schriftlicher Genehmigung des Vermieters.

6. Schlüssel und Sicherheit
Die Haustür ist nach 20:00 Uhr abzuschließen. Schlüssel dürfen nicht weitergegeben werden. Verlust ist sofort zu melden.

7. Rauchen
Das Rauchen in der Wohnung und in Gemeinschaftsflächen ist untersagt.

8. Mülltrennung
Restmüll, Papier, Verpackungen (Gelber Sack) und Biomüll sind getrennt zu entsorgen.""",

    "Belehrung Bohrarbeiten.odt": """Belehrung: Bohr- und Dübelarbeiten in der Wohnung

Der Mieter wird hiermit über folgende Regelungen belehrt:

1. Bohren und Dübeln ist grundsätzlich erlaubt, soweit es dem üblichen Wohngebrauch entspricht (z.B. Bilder, Gardinen, Regale aufhängen).

2. Tragende Wände sowie Außenwände dürfen nur mit besonderer Vorsicht und unter Berücksichtigung möglicher Leitungen (Wasser, Strom, Gas) bearbeitet werden. Im Zweifelsfall ist die Zustimmung des Vermieters einzuholen.

3. Schäden, die durch unsachgemäße Bohrarbeiten entstehen (z.B. Beschädigung von Wasserleitungen, Elektrokabeln, Fliesen), gehen zu Lasten des Mieters.

4. Bei Auszug sind alle Dübelllöcher fachgerecht zu verschließen und die Wände in einen ordnungsgemäßen Zustand zu versetzen.

Der Mieter bestätigt, diese Belehrung erhalten und verstanden zu haben.""",

    "Belehrung Garten Feuer.odt": """Belehrung: Garten und offenes Feuer

Der Mieter wird hiermit über folgende Regelungen belehrt:

1. Offenes Feuer (Lagerfeuer, Feuerkörbe) im Garten ist ohne ausdrückliche Genehmigung des Vermieters nicht gestattet.

2. Grills (Holzkohle, Gas, Elektro) dürfen im Garten genutzt werden, sofern dabei ausreichend Abstand zu Gebäuden, Hecken und brennbaren Materialien eingehalten wird. Der Grill darf niemals unbeaufsichtigt gelassen werden.

3. Feuerwerkskörper sind auf dem Grundstück verboten.

4. Gartenabfälle (Rasenschnitt, Laub, Äste) sind ordnungsgemäß zu entsorgen.

5. Veränderungen im Garten bedürften der Zustimmung des Vermieters.

Der Mieter bestätigt, diese Belehrung erhalten und verstanden zu haben.""",

    "Belehrung Klimaanlage.odt": """Belehrung: Verwendung und Betrieb einer Klimaanlage

Der Mieter wird hiermit über folgende Regelungen belehrt:

1. Die Installation einer Klimaanlage benötigt die vorherige schriftliche Zustimmung des Vermieters.

2. Klimageräte mit Außeneinheit (Split-Geräte) dürfen nur durch einen zugelassenen Fachbetrieb installiert werden.

3. Kondensatableitungen müssen so geführt werden, dass keine Schäden an der Bausubstanz entstehen.

4. Der Mieter trägt die Betriebskosten (Strom) der Klimaanlage.

5. Bei Auszug sind durch den Mieter veranlasste Installationen fachgerecht zu entfernen und Schäden zu beseitigen.

Der Mieter bestätigt, diese Belehrung erhalten und verstanden zu haben.""",

    "Belehrung Küche.odt": """Belehrung: Küche und Küchen-Geräte

Der Mieter wird hiermit über folgende Regelungen belehrt:

1. Dunstabzugshauben-Filter sind regelmäßig (mindestens alle 3 Monate) zu reinigen oder zu wechseln, um Fettansammlungen und Brandgefahr zu vermeiden.

2. Das Kochen ohne Aufsicht und das Verlassen des Herds bei hoher Temperatur ist zu vermeiden.

3. Abflüsse sind frei von Fett, Speiseresten und Fremdkörpern zu halten. Fett darf nicht in den Abfluss gegossen werden.

4. Küchenabfälle sind in der Biotonne zu entsorgen.

5. Schäden am Kücheninventar, die durch unsachgemäße Nutzung entstehen, gehen zu Lasten des Mieters.

Der Mieter bestätigt, diese Belehrung erhalten und verstanden zu haben.""",

    "Belehrung Lüften Schimmel.odt": """Belehrung: Richtiges Lüften und Schimmelvermeidung

Der Mieter wird hiermit über folgende Regelungen belehrt:

1. Regelmäßiges Lüften ist Pflicht des Mieters: Mindestens 3-mal täglich für 5-10 Minuten Stoßlüften (Fenster weit öffnen, Querlüftung).

2. Dauerlüften durch gekippte Fenster ist ineffizient und kann im Winter zu Schimmel führen.

3. Besonders nach dem Duschen, Kochen und Wäschetrocknen ist sofort zu lüften.

4. Die Raumtemperatur sollte auch in ungenutzten Zimmern nicht unter 16 Grad fallen.

5. Möbel sollten mit mindestens 10 cm Abstand zur Außenwand aufgestellt werden.

6. Wäsche sollte möglichst nicht in der Wohnung getrocknet werden. Falls doch, sofort danach lüften.

7. Schimmelbefall ist dem Vermieter unverzüglich zu melden. Schäden durch nachweislich mangelhaftes Lüftungsverhalten trägt der Mieter.

Der Mieter bestätigt, diese Belehrung erhalten und verstanden zu haben.""",

    "Belehrung Rauchen.odt": """Belehrung: Rauchverbot in der Mietwohnung

Der Mieter wird hiermit über folgende Regelungen belehrt:

1. In der Mietwohnung und in allen Gemeinschaftsflächen des Hauses (Treppenhaus, Keller, Hauseingang) ist das Rauchen strengstens untersagt.

2. Das Verbot gilt für alle Arten von Tabak-, Vapor- und E-Zigaretten-Produkten.

3. Rauchen ist ausschließlich außerhalb des Gebäudes gestattet.

4. Nikotinablagerungen an Wänden, Decken, Fenstern und Böden, die auf das Rauchen in der Wohnung zurückzuführen sind, werden dem Mieter bei Auszug in Rechnung gestellt.

5. Bei wiederholtem Verstoß behält sich der Vermieter vor, das Mietverhältnis außerordentlich zu kündigen.

Der Mieter bestätigt, diese Belehrung erhalten und verstanden zu haben.""",

    "Checkliste_Einzug_Auszug.odt": """Checkliste Einzug / Auszug

Wohnung: ________________________   Datum: ________________________
Mieter:  ________________________

EINZUG - zu prüfende Punkte:
[ ] Schlüsselübergabe (Anzahl Schlüssel: ___)
[ ] Zählerstände erfasst (Strom, Wasser, Gas)
[ ] Wände und Decken: Zustand ________________________
[ ] Böden: Zustand ________________________
[ ] Fenster und Türen: Zustand ________________________
[ ] Küche: Zustand ________________________
[ ] Bad/WC: Zustand ________________________
[ ] Keller: Zustand ________________________
[ ] Heizung: Funktionsfähig [ ] Ja  [ ] Nein
[ ] Rauchwarnmelder: Vorhanden und funktionsfähig [ ] Ja  [ ] Nein

AUSZUG - zu prüfende Punkte:
[ ] Schlüsselrückgabe (Anzahl Schlüssel: ___)
[ ] Zählerstände erfasst (Strom, Wasser, Gas)
[ ] Wohnung besenrein übergeben: [ ] Ja  [ ] Nein
[ ] Einbauten des Mieters entfernt: [ ] Ja  [ ] Nein
[ ] Schäden dokumentiert: ________________________
[ ] Kaution: Rückzahlung besprochen [ ] Ja""",

    "Schlüsselprotokoll.odt": """Schlüsselprotokoll

Objekt: Hauptstraße 15, 66802 Überherrn
Vermieter: Alexander Klingel, Nauwies 7, 66802 Überherrn
Mieter: ________________________
Wohnung: ________________________

Übergabe der folgenden Schlüssel:

Kombischlüssel (Haustür/Wohnungstür):   ___ Stück
Briefkasten:                             ___ Stück
Kellerraum:                              ___ Stück
Sonstige:                                ___ Stück  (Bezeichnung: _______________)

Datum der Übergabe: ________________________

Der Mieter bestätigt den Empfang der oben genannten Schlüssel und verpflichtet sich:
- Schlüssel nicht unbefugt zu vervielfältigen
- Schlüssel bei Verlust sofort zu melden
- Alle Schlüssel bei Beendigung des Mietverhältnisses vollständig zurückzugeben
- Kosten für Schlüsselersatz und ggf. Schlosstausch bei Verlust zu tragen""",

    "Wohnungsübergabeprotokoll.odt": """Wohnungsübergabeprotokoll

Objekt: Hauptstraße 15, 66802 Überherrn
Vermieter: Alexander Klingel
Mieter: ________________________
Wohnung: ________________________
Art der Übergabe: [ ] Einzug   [ ] Auszug
Datum: ________________________

Zählerstände:
Strom:  ________________  kWh
Gas:    ________________  kWh / m3
Wasser: ________________  m3

Raumzustand (Mängel bitte beschreiben):

Flur/Diele:    [ ] i.O.   Mängel: ________________________
Wohnzimmer:    [ ] i.O.   Mängel: ________________________
Schlafzimmer:  [ ] i.O.   Mängel: ________________________
Küche:         [ ] i.O.   Mängel: ________________________
Bad/WC:        [ ] i.O.   Mängel: ________________________
Keller:        [ ] i.O.   Mängel: ________________________

Rauchwarnmelder: Anzahl ___   Funktionsfähig: [ ] Ja  [ ] Nein

Sonstige Bemerkungen:
________________________________________________________________

Schlüssel übergeben: Anzahl ___""",

    "Anlage Betriebskosten.odt": """Anlage Betriebskosten zum Mietvertrag

Objekt: Hauptstraße 15, 66802 Überherrn
Vermieter: Alexander Klingel, Nauwies 7, 66802 Überherrn

Gemäß § 6 des Mietvertrages trägt der Mieter anteilig folgende Betriebskosten:

1. Grundsteuer (anteilig nach Wohnfläche)
2. Wasser- und Abwasserkosten (anteilig nach Verbrauch)
3. Niederschlagswassergebühr (anteilig nach Wohnfläche)
4. Müll-/Abfallentsorgung EVS (anteilig nach Wohnung)
5. Gebäudeversicherung (anteilig nach Wohnfläche)
6. Allgemeinstrom - Treppenhaus, Keller (anteilig nach Wohnfläche)
7. Schornsteinfegerkosten (anteilig nach Wohnfläche)
8. Heizkosten Gas (anteilig nach Verbrauch, Abrechnung Zenner)

Abrechnungszeitraum: Jeweils 1. Januar bis 31. Dezember.
Vorauszahlungen werden jährlich abgerechnet. Guthaben werden erstattet, Nachzahlungen sind fällig.

Der Mieter nimmt diese Anlage als Bestandteil des Mietvertrages zur Kenntnis.""",
}


def get_default_text(filename: str) -> str:
    """Try to extract text from the actual ODT file; fall back to hardcoded defaults."""
    path = os.path.join(DOCUMENTS_DIR, filename)
    if os.path.isfile(path):
        from app.services.odt_reader import extract_odt_text
        text = extract_odt_text(path)
        if text:
            return text
    return DEFAULT_TEXTS.get(filename, f"Dokument: {filename}\n\nDer Mieter bestätigt den Erhalt und die Kenntnisnahme dieses Dokuments.")


def _apt_label(apt: Optional[Apartment]) -> str:
    if not apt:
        return "-"
    labels = {"EG": "Erdgeschoss", "OG": "Obergeschoss", "DG": "Dachgeschoss", "DU": "Büro"}
    return labels.get(apt.code, apt.name or apt.code or "-")


async def _enrich(doc: HouseDocument, db: AsyncSession) -> dict:
    apt_code = None
    apt_name = None
    apt_label = "-"
    tenant_user_name = None
    if doc.apartment_id:
        res = await db.execute(select(Apartment).where(Apartment.id == doc.apartment_id))
        apt = res.scalar_one_or_none()
        if apt:
            apt_code = apt.code
            apt_name = apt.name
            apt_label = _apt_label(apt)
    if doc.tenant_user_id:
        res = await db.execute(select(User).where(User.id == doc.tenant_user_id))
        u = res.scalar_one_or_none()
        if u:
            tenant_user_name = u.name
    return {
        "id": doc.id,
        "template_filename": doc.template_filename,
        "title": doc.title,
        "document_text": doc.document_text or "",
        "apartment_id": doc.apartment_id,
        "apartment_code": apt_code,
        "apartment_name": apt_name,
        "apartment_label": apt_label,
        "tenant_user_id": doc.tenant_user_id,
        "tenant_user_name": tenant_user_name,
        "tenant_name": doc.tenant_name,
        "status": doc.status if isinstance(doc.status, str) else doc.status.value,
        "tenant_signed_at": doc.tenant_signed_at.isoformat() if doc.tenant_signed_at else None,
        "landlord_signed_at": doc.landlord_signed_at.isoformat() if doc.landlord_signed_at else None,
        "has_pdf": bool(doc.pdf_filename),
        "created_at": doc.created_at.isoformat(),
    }


@router.get("/templates")
async def list_templates(_: User = Depends(get_current_admin)):
    templates = []
    if os.path.isdir(DOCUMENTS_DIR):
        for fname in sorted(os.listdir(DOCUMENTS_DIR)):
            if fname.lower().endswith(".odt"):
                title = fname[:-4].replace("_", " ")
                templates.append({"filename": fname, "title": title})
    return templates


@router.get("/templates/{filename}/download")
async def download_template(filename: str, _: User = Depends(get_current_admin)):
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Ungültiger Dateiname")
    path = os.path.join(DOCUMENTS_DIR, filename)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Datei nicht gefunden")
    return FileResponse(path=path, filename=filename, media_type="application/vnd.oasis.opendocument.text")


@router.get("/templates/{filename}/default-text")
async def get_default_text_endpoint(filename: str, _: User = Depends(get_current_admin)):
    return {"text": get_default_text(filename)}


@router.get("", response_model=List[dict])
async def list_house_documents(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    result = await db.execute(select(HouseDocument).order_by(HouseDocument.created_at.desc()))
    docs = result.scalars().all()
    return [await _enrich(d, db) for d in docs]


@router.post("", status_code=201)
async def create_house_document(
    body: dict,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    template_filename = body.get("template_filename", "")
    title = body.get("title") or template_filename.replace(".odt", "").replace("_", " ")
    apartment_id = body.get("apartment_id") or None
    tenant_user_id = body.get("tenant_user_id") or None
    tenant_name = body.get("tenant_name") or ""
    document_text = body.get("document_text") or get_default_text(template_filename)

    if not template_filename:
        raise HTTPException(status_code=400, detail="template_filename fehlt")

    doc = HouseDocument(
        template_filename=template_filename,
        title=title,
        apartment_id=apartment_id,
        tenant_user_id=tenant_user_id,
        tenant_name=tenant_name,
        document_text=document_text,
        status=HouseDocumentStatus.DRAFT.value,
    )
    db.add(doc)
    await db.flush()
    await db.commit()
    return await _enrich(doc, db)


@router.put("/{doc_id}/text")
async def update_document_text(
    doc_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    """Update the editable text of a draft document."""
    result = await db.execute(select(HouseDocument).where(HouseDocument.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Dokument nicht gefunden")
    if doc.status != HouseDocumentStatus.DRAFT.value:
        raise HTTPException(status_code=400, detail="Nur Entwürfe können bearbeitet werden")
    doc.title = body.get("title") or doc.title
    doc.document_text = body.get("document_text") or doc.document_text
    await db.commit()
    return await _enrich(doc, db)


@router.delete("/{doc_id}", status_code=204)
async def delete_house_document(
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    result = await db.execute(select(HouseDocument).where(HouseDocument.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Dokument nicht gefunden")
    # Remove PDF file if present
    if doc.pdf_filename:
        pdf_path = os.path.join(settings.UPLOAD_DIR, doc.pdf_filename)
        if os.path.exists(pdf_path):
            os.remove(pdf_path)
    await db.delete(doc)
    await db.commit()



@router.post("/{doc_id}/send")
async def send_house_document(
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    result = await db.execute(select(HouseDocument).where(HouseDocument.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Dokument nicht gefunden")
    if doc.status != HouseDocumentStatus.DRAFT.value:
        raise HTTPException(status_code=400, detail="Dokument ist nicht im Entwurf-Status")
    if not doc.tenant_user_id:
        raise HTTPException(status_code=400, detail="Kein Mieter-Login zugeordnet")
    doc.status = HouseDocumentStatus.SENT.value
    await db.commit()
    return await _enrich(doc, db)


@router.post("/{doc_id}/sign-direct")
async def sign_direct(
    doc_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    """Tenant signs in-person at admin portal. DRAFT/SENT -> SIGNED."""
    result = await db.execute(select(HouseDocument).where(HouseDocument.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Dokument nicht gefunden")
    if doc.status == HouseDocumentStatus.SIGNED.value:
        raise HTTPException(status_code=400, detail="Bereits unterschrieben")

    signature_b64 = body.get("signature")
    if not signature_b64:
        raise HTTPException(status_code=400, detail="Unterschrift fehlt")

    updated_text = body.get("document_text")
    if updated_text:
        doc.document_text = updated_text

    doc.tenant_signature = signature_b64
    doc.tenant_signed_at = datetime.now(timezone.utc)
    doc.tenant_signed_ip = "admin-portal"
    doc.status = HouseDocumentStatus.SIGNED.value

    apt_label = "-"
    if doc.apartment_id:
        apt_res = await db.execute(select(Apartment).where(Apartment.id == doc.apartment_id))
        apt = apt_res.scalar_one_or_none()
        apt_label = _apt_label(apt)

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    filename = f"hausunterlage_{doc.id}.pdf"
    output_path = os.path.join(settings.UPLOAD_DIR, filename)

    from app.services.house_document_pdf import generate_house_document_pdf
    success = generate_house_document_pdf(
        output_path=output_path,
        title=doc.title,
        template_filename=doc.template_filename,
        tenant_name=doc.tenant_name or "-",
        apartment_label=apt_label,
        document_text=doc.document_text or "",
        tenant_signature_b64=signature_b64,
        tenant_signed_at=doc.tenant_signed_at,
        tenant_signed_ip="Admin-Portal (vor Ort)",
    )
    if success:
        doc.pdf_filename = filename

    await db.commit()
    return await _enrich(doc, db)


@router.post("/{doc_id}/landlord-sign")
async def landlord_sign(
    doc_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    result = await db.execute(select(HouseDocument).where(HouseDocument.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Dokument nicht gefunden")
    if doc.status != HouseDocumentStatus.SIGNED.value:
        raise HTTPException(status_code=400, detail="Mieter hat noch nicht unterschrieben")

    signature_b64 = body.get("signature")
    if not signature_b64:
        raise HTTPException(status_code=400, detail="Unterschrift fehlt")

    doc.landlord_signature = signature_b64
    doc.landlord_signed_at = datetime.now(timezone.utc)

    apt_label = "-"
    if doc.apartment_id:
        apt_res = await db.execute(select(Apartment).where(Apartment.id == doc.apartment_id))
        apt = apt_res.scalar_one_or_none()
        apt_label = _apt_label(apt)

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    filename = f"hausunterlage_{doc.id}.pdf"
    output_path = os.path.join(settings.UPLOAD_DIR, filename)

    from app.services.house_document_pdf import generate_house_document_pdf
    success = generate_house_document_pdf(
        output_path=output_path,
        title=doc.title,
        template_filename=doc.template_filename,
        tenant_name=doc.tenant_name or "-",
        apartment_label=apt_label,
        document_text=doc.document_text or "",
        tenant_signature_b64=doc.tenant_signature,
        tenant_signed_at=doc.tenant_signed_at,
        tenant_signed_ip=doc.tenant_signed_ip,
        landlord_signature_b64=signature_b64,
        landlord_signed_at=doc.landlord_signed_at,
    )
    if success:
        doc.pdf_filename = filename

    await db.commit()
    return await _enrich(doc, db)


@router.get("/{doc_id}/pdf")
async def download_pdf(
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    result = await db.execute(select(HouseDocument).where(HouseDocument.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc or not doc.pdf_filename:
        raise HTTPException(status_code=404, detail="PDF nicht vorhanden")
    pdf_path = os.path.join(settings.UPLOAD_DIR, doc.pdf_filename)
    if not os.path.exists(pdf_path):
        raise HTTPException(status_code=404, detail="PDF-Datei nicht gefunden")
    return FileResponse(
        path=pdf_path,
        filename=f"Hausunterlage_{doc.title}.pdf",
        media_type="application/pdf",
    )
