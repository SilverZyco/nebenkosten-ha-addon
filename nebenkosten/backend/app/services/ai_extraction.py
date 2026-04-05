"""
AI extraction service using OpenAI Function Calling.
KI only extracts data – all calculations are deterministic in the backend.
"""
import json
import logging
from typing import Optional, Dict, Any
from app.core.config import settings

logger = logging.getLogger(__name__)

# JSON schema for function calling
EXTRACTION_SCHEMA = {
    "name": "extract_document_data",
    "description": "Extrahiert strukturierte Daten aus einem deutschen Nebenkostenbeleg.",
    "parameters": {
        "type": "object",
        "properties": {
            "document_type": {
                "type": "string",
                "enum": [
                    "water_invoice", "gas_invoice", "waste_invoice_evs",
                    "maintenance_invoice", "chimney_sweep_invoice",
                    "electricity_common_invoice", "rainwater_fee_invoice",
                    "property_tax_notice", "insurance_invoice",
                    "contract", "meter_reading", "handover_protocol",
                    "house_rules", "other"
                ],
                "description": "Dokumenttyp"
            },
            "supplier_name": {"type": "string", "description": "Name des Lieferanten/Absenders"},
            "invoice_number": {"type": "string", "description": "Rechnungsnummer"},
            "invoice_date": {"type": "string", "description": "Rechnungsdatum YYYY-MM-DD"},
            "service_period_from": {"type": "string", "description": "Leistungszeitraum von YYYY-MM-DD"},
            "service_period_to": {"type": "string", "description": "Leistungszeitraum bis YYYY-MM-DD"},
            "total_amount": {"type": "number", "description": "Gesamtbetrag in EUR (bei Wasserrechnung: inkl. Niederschlagswasser)"},
            "rainwater_amount": {
                "type": "number",
                "description": "Wasserrechnung/KDÜ: Betrag für Niederschlagswasser/Regenwasser in EUR (separate Position in der Rechnung). Nur setzen wenn explizit ausgewiesen."
            },
            "wastewater_amount": {
                "type": "number",
                "description": "Wasserrechnung/KDÜ: Betrag für Schmutzwasser/Abwasser in EUR (separate Position). Typische Bezeichnungen: 'Schmutzwassergebühr', 'Abwasser', 'Schmutzwasser'. Nur setzen wenn explizit ausgewiesen."
            },
            "bill_total_kwh": {
                "type": "number",
                "description": "Gasrechnung: Gesamtenergie in kWh laut Rechnung"
            },
            "gas_m3": {"type": "number", "description": "Gasrechnung: Gesamtvolumen m³ (optional)"},
            "conversion_factor": {"type": "number", "description": "Brennwert oder Zustandszahl (optional)"},
            "bins": {
                "type": "array",
                "description": "EVS Müllrechnung: Positionen pro Tonne. Jede Tonne (Behälternummer) als eigenes Objekt.",
                "items": {
                    "type": "object",
                    "properties": {
                        "bin_id": {"type": "string", "description": "Tonnen-/Behälternummer (z.B. 312864)"},
                        "bin_size": {"type": "string", "description": "Behältergröße z.B. 120L oder 240L"},
                        "base_fee": {"type": "number", "description": "Grundgebühr / Bereitstellungspauschale in EUR"},
                        "emptyings": {
                            "type": "array",
                            "description": "Reguläre/Standard-Leerungen (Turnus-Leerungen, planmäßige Leerungen). NICHT Zusatz- oder Sonderleerungen.",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "count": {"type": "integer", "description": "Anzahl der Leerungen"},
                                    "price_per_emptying": {"type": "number", "description": "Preis pro Leerung in EUR"},
                                    "amount": {"type": "number", "description": "Gesamtbetrag für diese Leerungsart in EUR"},
                                    "description": {"type": "string", "description": "Bezeichnung z.B. 'Standardleerung' oder 'Restmüll 120L'"}
                                }
                            }
                        },
                        "extra_emptyings": {
                            "type": "array",
                            "description": "Zusatzleerungen / Sonderleerungen / außerplanmäßige Leerungen. Typisch am Ende der Rechnung als separater Abschnitt 'Zusatzleerungen' oder 'Sonderleerungen'.",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "count": {"type": "integer", "description": "Anzahl der Zusatzleerungen"},
                                    "price_per_emptying": {"type": "number", "description": "Preis pro Zusatzleerung in EUR"},
                                    "amount": {"type": "number", "description": "Gesamtbetrag für diese Zusatzleerungen in EUR"},
                                    "description": {"type": "string", "description": "Bezeichnung z.B. 'Zusatzleerung' oder 'Sonderleerung 120L'"}
                                }
                            }
                        },
                        "total": {"type": "number", "description": "Gesamtbetrag für diese Tonne in EUR"}
                    },
                    "required": ["bin_id"]
                }
            },
            "notes": {"type": "string", "description": "Weitere relevante Informationen aus dem Dokument"}
        },
        "required": ["document_type", "total_amount"]
    }
}

SYSTEM_PROMPT = """Du bist ein Assistent der Daten aus deutschen Nebenkostenbelegen extrahiert.
Extrahiere präzise und nur was tatsächlich im Dokument steht.

Bei EVS-Müllrechnungen (waste_invoice_evs):
- Erkenne alle Tonnen-/Behälternummern und ihre Positionen.
- EVS-Rechnungen haben typisch ZWEI Abschnitte:
  1. Oben: reguläre/planmäßige Leerungen → in "emptyings" eintragen.
  2. Unten: Zusatzleerungen / Sonderleerungen (extra bestellte Leerungen außerhalb des Turnus) → in "extra_emptyings" eintragen.
- Erkenne den Unterschied: Standardleerungen sind im regulären Turnus, Zusatzleerungen/Sonderleerungen sind außerplanmäßig und werden separat abgerechnet.
- Jede Tonne hat eine eigene Behälternummer (ohne führende Nullen oder mit).

Bei Wasserrechnungen / KDÜ (Kostendarstellungsübersicht vom Wasserversorger):
- "total_amount" = SUMME ALLER JAHRESKOSTEN (Trinkwasser + Schmutzwasser + Niederschlagswasser zusammen).
  WICHTIG: NICHT den "zu zahlenden Betrag" / "Nachzahlung" / "Rechnungsbetrag nach Abzug von Vorauszahlungen" nehmen!
  Der richtige Wert ist die Summe aller Kostenarten für das Jahr (Jahreskosten gesamt / Gesamtverbrauchskosten).
  Typisch steht das als "Gesamtkosten", "Jahresabrechnung gesamt" oder ist die Summe der Einzelpositionen.
- Falls Niederschlagswasser / Regenwasser als SEPARATE Position ausgewiesen ist → in "rainwater_amount" eintragen.
  Typische Bezeichnungen: "Niederschlagswasser", "Regenwasser", "Oberflächenwasser", "NW-Gebühr".
- Falls Schmutzwasser / Abwasser als SEPARATE Position ausgewiesen ist → in "wastewater_amount" eintragen.
  Typische Bezeichnungen: "Schmutzwassergebühr", "Abwasser", "Schmutzwasser", "SW-Gebühr".
- Trinkwasser ergibt sich aus: total_amount - rainwater_amount - wastewater_amount.
- Kontrollregel: rainwater_amount + wastewater_amount muss kleiner als total_amount sein.

Bei Gasrechnungen: Erkenne den Gesamtenergieverbrauch in kWh (nicht umrechnen, direkt ablesen).
Alle Beträge in EUR als Dezimalzahl. Datumsangaben als YYYY-MM-DD.
Wenn ein Wert unklar ist, lasse ihn weg statt zu raten."""


async def extract_document_data(ocr_text: str, filename: str = "") -> Optional[Dict[str, Any]]:
    """Use OpenAI to extract structured data from OCR text."""
    if not settings.OPENAI_API_KEY or not settings.AI_ENABLED:
        logger.info("AI extraction disabled (no API key or disabled)")
        return None

    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

        user_message = f"Dateiname: {filename}\n\n=== OCR-Text ===\n{ocr_text[:8000]}"

        response = await client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
            tools=[{"type": "function", "function": EXTRACTION_SCHEMA}],
            tool_choice={"type": "function", "function": {"name": "extract_document_data"}},
            temperature=0,
        )

        message = response.choices[0].message
        if message.tool_calls:
            tool_call = message.tool_calls[0]
            extracted = json.loads(tool_call.function.arguments)
            logger.info(f"AI extracted: {list(extracted.keys())}")
            return extracted

    except Exception as e:
        logger.error(f"AI extraction failed: {e}")
        return None

    return None


async def extract_document_data_vision(file_path: str, filename: str = "") -> Optional[Dict[str, Any]]:
    """Use GPT-4o Vision to extract structured data directly from an image file."""
    if not settings.OPENAI_API_KEY or not settings.AI_ENABLED:
        logger.info("AI extraction disabled (no API key or disabled)")
        return None

    try:
        import base64
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

        with open(file_path, "rb") as f:
            contents = f.read()

        ext = file_path.lower().rsplit(".", 1)[-1]
        mime_map = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
                    "tif": "image/tiff", "tiff": "image/tiff"}
        mime = mime_map.get(ext, "image/jpeg")
        b64 = base64.b64encode(contents).decode()

        vision_prompt = (
            f"Dateiname: {filename}\n\n"
            "Analysiere dieses Bild eines deutschen Nebenkostenbelegs (Rechnung, Bescheid, etc.) "
            "und extrahiere die strukturierten Daten."
        )

        response = await client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": vision_prompt},
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:{mime};base64,{b64}", "detail": "high"},
                        },
                    ],
                },
            ],
            tools=[{"type": "function", "function": EXTRACTION_SCHEMA}],
            tool_choice={"type": "function", "function": {"name": "extract_document_data"}},
            temperature=0,
        )

        message = response.choices[0].message
        if message.tool_calls:
            tool_call = message.tool_calls[0]
            extracted = json.loads(tool_call.function.arguments)
            logger.info(f"Vision AI extracted: {list(extracted.keys())}")
            return extracted

    except Exception as e:
        logger.error(f"Vision AI extraction failed: {e}")
        return None

    return None
