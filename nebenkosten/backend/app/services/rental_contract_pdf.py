"""PDF generation for Mietvertrag (rental contract) using ReportLab."""
import logging
import os
from datetime import datetime
from decimal import Decimal
from typing import Optional

logger = logging.getLogger(__name__)

from .pdf_utils import (
    COL_DARK, COL_MID, COL_GRAY, COL_LGRAY,
    _fmt_eur, _fmt_date, _sig_to_white_bg,
)


def generate_rental_contract_pdf(
    output_path: str,
    tenant_name: str,
    tenant_address1: Optional[str],
    tenant_address2: Optional[str],
    tenant_address3: Optional[str],
    apartment_code: str,
    apartment_name: str,
    apartment_area_sqm: Optional[float],
    start_date,
    monthly_rent: Decimal,
    advance_payment: Decimal,
    kitchen_fee: Optional[Decimal],
    deposit: Decimal,
    special_notes: Optional[str],
    contract_paragraphs: Optional[dict] = None,
    tenant_signature_b64: Optional[str] = None,
    signed_at: Optional[datetime] = None,
    signed_ip: Optional[str] = None,
    landlord_signature_b64: Optional[str] = None,
    landlord_signed_at: Optional[datetime] = None,
    has_cellar: bool = True,
    deposit_months: int = 3,
    is_demo: bool = False,
) -> bool:
    """Generate the full Wohnraummietvertrag as PDF."""
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib import colors
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import cm, mm
        from reportlab.platypus import (
            SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
            HRFlowable, KeepTogether, Image
        )
        from reportlab.lib.enums import TA_LEFT, TA_RIGHT, TA_CENTER, TA_JUSTIFY

        W, H = A4

        doc = SimpleDocTemplate(
            output_path,
            pagesize=A4,
            rightMargin=2.5 * cm,
            leftMargin=2.5 * cm,
            topMargin=2.2 * cm,
            bottomMargin=2.5 * cm,
        )

        def hex_color(h: str):
            return colors.HexColor(h)

        S = getSampleStyleSheet()

        def sty(name, **kw):
            base = kw.pop("parent", S["Normal"])
            return ParagraphStyle(name, parent=base, **kw)

        title_sty = sty("Title2",
            fontSize=16, leading=20,
            textColor=hex_color(COL_DARK),
            fontName="Helvetica-Bold", spaceAfter=2)

        head_sty = sty("Head",
            fontSize=10, leading=13,
            textColor=hex_color(COL_DARK),
            fontName="Helvetica-Bold",
            spaceBefore=10, spaceAfter=3)

        norm_sty = sty("Norm", fontSize=9, leading=13, alignment=TA_JUSTIFY)

        small_sty = sty("Small", fontSize=7.5, leading=11, textColor=hex_color(COL_GRAY))
        small_c = sty("SmallC", fontSize=7.5, leading=11,
                      textColor=hex_color(COL_GRAY), alignment=TA_CENTER)

        story = []

        # Logo top right
        from app.services.pdf_logo import get_logo_image
        logo = get_logo_image()
        if logo:
            logo_table = Table([[logo]], colWidths=[16.5 * cm])
            logo_table.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "RIGHT")]))
            story.append(logo_table)

        # ─── Letterhead ───────────────────────────────────────────
        lh_data = [[
            Paragraph(
                "<b>Vermieter:</b><br/>Alexander Klingel<br/>Hauptstraße 15<br/>66802 Überherrn",
                sty("Sender", fontSize=8.5, leading=13, textColor=hex_color(COL_GRAY))
            ),
            Paragraph("Wohnraummietvertrag", title_sty),
        ]]
        lh_tbl = Table(lh_data, colWidths=[7 * cm, None])
        lh_tbl.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
        ]))
        story.append(lh_tbl)
        story.append(Spacer(1, 2 * mm))
        story.append(HRFlowable(width="100%", thickness=3,
                                color=hex_color(COL_MID), spaceAfter=8))

        # ─── Vertragsparteien-Box ──────────────────────────────────
        def info_row(label, value):
            return [
                Paragraph(label, sty("IK", fontSize=8.5, leading=12, textColor=hex_color(COL_GRAY))),
                Paragraph(str(value) if value else "–", sty("IV", fontSize=8.5, leading=12, fontName="Helvetica-Bold")),
            ]

        floor_label = {
            "EG": "Erdgeschoss",
            "OG": "Obergeschoss",
            "DG": "Dachgeschoss",
            "DU": "Büro",
        }.get(apartment_code, apartment_code or "Wohnung")

        area_str = f"{apartment_area_sqm:.1f} m²" if apartment_area_sqm else "–"
        kitchen_str = _fmt_eur(kitchen_fee) if kitchen_fee else "entfällt"
        total_warm = monthly_rent + advance_payment + (kitchen_fee or Decimal("0"))

        tenant_lines = [tenant_name]
        for addr in [tenant_address1, tenant_address2, tenant_address3]:
            if addr:
                tenant_lines.append(addr)

        info_data = [
            info_row("Mieter", "<br/>".join(tenant_lines)),
            info_row("Wohnung / Etage", f"{apartment_name} – {floor_label}"),
            info_row("Wohnfläche", area_str),
            info_row("Mietbeginn", _fmt_date(start_date)),
            info_row("Kaltmiete", _fmt_eur(monthly_rent)),
            info_row("NK-Vorauszahlung", _fmt_eur(advance_payment)),
            info_row("Küchennutzungsentgelt", kitchen_str),
            info_row("Gesamtmiete (warm)", _fmt_eur(total_warm)),
            info_row(f"Kaution ({deposit_months} × Kaltmiete)", _fmt_eur(deposit)),
        ]

        col_w = (W - 5 * cm)
        info_tbl = Table(info_data, colWidths=[4.5 * cm, col_w - 4.5 * cm])
        info_tbl.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), hex_color(COL_LGRAY)),
            ("GRID", (0, 0), (-1, -1), 0.3, hex_color("#e5e7eb")),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]))
        story.append(info_tbl)
        story.append(Spacer(1, 6 * mm))

        # ─── Paragraph helper ─────────────────────────────────────
        # Financial paragraphs are always generated fresh from actual amounts
        # to prevent stale 0,00-€ values from stored paragraph texts.
        _ALWAYS_FRESH = {"p1", "p2", "p3", "p5"}

        def get_para(key: str, default: str) -> str:
            if contract_paragraphs and key in contract_paragraphs and key not in _ALWAYS_FRESH:
                return contract_paragraphs[key]
            return default

        def section(nr, title, text):
            items = [Paragraph(f"§ {nr}  {title}", head_sty)]
            items.append(Paragraph(text, norm_sty))
            items.append(Spacer(1, 1.5 * mm))
            return KeepTogether(items)

        kitchen_para_default = (
            f"Für die Mitbenutzung der Einbauküche wird ein gesondertes Entgelt von "
            f"<b>{_fmt_eur(kitchen_fee)}</b> monatlich vereinbart. "
            f"Dieses Entgelt ist zusammen mit der Miete fällig."
        ) if kitchen_fee else "Eine Einbauküche ist nicht Gegenstand dieses Mietvertrages."

        cellar_text = " sowie ein Kellerabteil" if has_cellar else ""
        story.append(section(1, "Mietgegenstand", get_para("p1",
            f"Der Vermieter vermietet an den Mieter die Wohnung im <b>{floor_label}</b> "
            f"des Hauses Hauptstraße 15, 66802 Überherrn. "
            f"Die Wohnfläche beträgt ca. <b>{area_str}</b>. "
            f"Zur Wohnung gehören: Flur, Wohnzimmer, Schlafzimmer, Küche, Bad/WC"
            f"{cellar_text}. Der Mieter ist berechtigt, den gemeinschaftlichen Garten "
            f"und die Gemeinschaftsflächen mitzubenutzen."
        )))

        story.append(section(2, "Mietzeit", get_para("p2",
            f"Das Mietverhältnis beginnt am <b>{_fmt_date(start_date)}</b> und wird auf "
            f"unbestimmte Zeit geschlossen. Eine Befristung ist nicht vereinbart."
        )))

        story.append(section(3, "Miete", get_para("p3",
            f"Die monatliche Kaltmiete beträgt <b>{_fmt_eur(monthly_rent)}</b>. "
            f"Zusätzlich ist eine monatliche Vorauszahlung auf die Betriebskosten "
            f"(Nebenkosten) in Höhe von <b>{_fmt_eur(advance_payment)}</b> zu entrichten. "
            + kitchen_para_default +
            f" Die Gesamtmiete beläuft sich somit auf <b>{_fmt_eur(total_warm)}</b> monatlich."
        )))

        story.append(section(4, "Zahlungsweise", get_para("p4",
            "Die Miete ist monatlich im Voraus, spätestens am 3. Werktag eines jeden Monats, "
            "auf das Konto des Vermieters zu überweisen. "
            "Der Verwendungszweck soll die Wohnungsbezeichnung und den Monat enthalten. "
            "Bei Zahlung durch Dauerauftrag hat der Mieter dafür zu sorgen, dass die "
            "Gutschrift rechtzeitig erfolgt."
        )))

        months_word = {1: "einer", 2: "zwei", 3: "drei", 4: "vier", 5: "fünf", 6: "sechs"}.get(deposit_months, str(deposit_months))
        story.append(section(5, "Kaution", get_para("p5",
            f"Der Mieter leistet eine Sicherheitskaution in Höhe von <b>{_fmt_eur(deposit)}</b> "
            f"(entspricht {months_word} Monatskaltmiete{'n' if deposit_months != 1 else ''}). Die Kaution ist spätestens bei Beginn "
            f"des Mietverhältnisses in voller Höhe zu entrichten. "
            "Der Vermieter legt die Kaution bei einem Kreditinstitut zu den für "
            "Spareinlagen mit dreimonatiger Kündigungsfrist üblichen Konditionen getrennt "
            "von seinem Vermögen an."
        )))

        story.append(section(6, "Betriebskosten / Nebenkosten", get_para("p6",
            "Der Mieter trägt anteilig die anfallenden Betriebskosten gemäß "
            "Betriebskostenverordnung (BetrKV). Hierzu zählen insbesondere: "
            "Wasser/Abwasser, Müllentsorgung, Gebäudeversicherung, Grundsteuer, "
            "Niederschlagswassergebühr, Allgemeinstrom sowie Schornsteinfegerkosten. "
            "Über die geleisteten Vorauszahlungen wird jährlich abgerechnet. "
            "Etwaige Nachzahlungen oder Guthaben werden dem Mieter innerhalb von "
            "12 Monaten nach Ende des Abrechnungszeitraums mitgeteilt."
        )))

        story.append(section(7, "Schlüssel", get_para("p7",
            "Der Mieter erhält die erforderlichen Schlüssel für Wohnungstür, Haustür "
            "und Keller. Bei Verlust eines Schlüssels trägt der Mieter die Kosten "
            "für die Wiederbeschaffung. Die Anfertigung von Schlüsseln bedarf der "
            "schriftlichen Zustimmung des Vermieters. Alle Schlüssel sind bei Auszug "
            "vollständig zurückzugeben."
        )))

        story.append(section(8, "Schönheitsreparaturen", get_para("p8",
            "Der Mieter ist verpflichtet, Schönheitsreparaturen während der Mietzeit "
            "nach Bedarf durchzuführen und die Wohnung bei Auszug in einem ordnungsgemäßen "
            "Zustand zurückzugeben. Zu den Schönheitsreparaturen zählen insbesondere "
            "das Streichen und Tapezieren von Wänden und Decken sowie die Pflege der "
            "Fußböden. Farbwahl und Ausführungsart bedürfen bei Veränderungen der "
            "Zustimmung des Vermieters."
        )))

        story.append(section(9, "Instandhaltung und Reparaturen", get_para("p9",
            "Der Vermieter trägt die Kosten für die Instandhaltung der Mietsache, "
            "soweit nicht der Mieter die Schäden verursacht hat. Kleinreparaturen bis "
            "zu einem Betrag von 100,00 € je Einzelreparatur, maximal jedoch 8 % der "
            "Jahresnettomiete, trägt der Mieter. Der Mieter hat Mängel unverzüglich "
            "schriftlich oder in Textform dem Vermieter anzuzeigen."
        )))

        story.append(section(10, "Lüften und Heizen", get_para("p10",
            "Der Mieter ist verpflichtet, die Wohnung angemessen zu lüften und zu heizen, "
            "um Feuchtigkeit und Schimmelbildung zu vermeiden. Mindestens dreimal täglich "
            "ist stoßzulüften (Querlüftung). Bei längerer Abwesenheit sind die notwendigen "
            "Maßnahmen zum Schutz der Wohnung vor Frost und Schimmel zu ergreifen. "
            "Für durch mangelhaftes Lüften entstandene Schäden haftet der Mieter."
        )))

        story.append(section(11, "Tierhaltung", get_para("p11",
            "Die Haltung von Kleintieren (z.B. Hamster, Vögel, Zierfische) ist gestattet. "
            "Die Haltung von Hunden und Katzen bedarf der ausdrücklichen schriftlichen "
            "Zustimmung des Vermieters. Diese kann aus sachlichem Grund verweigert oder "
            "widerrufen werden."
        )))

        story.append(section(12, "Nichtraucher-Wohnung", get_para("p12",
            "In der Wohnung sowie in allen Gemeinschaftsflächen des Hauses ist das "
            "Rauchen nicht gestattet. Bei Nichtbeachtung haftet der Mieter für alle "
            "durch das Rauchen entstandenen Schäden an der Mietsache."
        )))

        story.append(section(13, "Untervermietung", get_para("p13",
            "Eine Untervermietung der Wohnung oder von Teilen davon ist ohne vorherige "
            "schriftliche Zustimmung des Vermieters nicht zulässig. Bei unerlaubter "
            "Untervermietung kann der Vermieter das Mietverhältnis außerordentlich kündigen."
        )))

        story.append(section(14, "Garten und Gemeinschaftsflächen", get_para("p14",
            "Dem Mieter wird das Recht zur Mitbenutzung des Gartens und der "
            "Gemeinschaftsflächen eingeräumt. Die Nutzung erfolgt auf eigene Gefahr. "
            "Veränderungen im Garten (Neuanpflanzungen, bauliche Maßnahmen) bedürfen "
            "der schriftlichen Zustimmung des Vermieters. Der Mieter ist verpflichtet, "
            "die Gemeinschaftsflächen sauber und ordentlich zu halten."
        )))

        story.append(section(15, "Rauchwarnmelder", get_para("p15",
            "In der Wohnung sind Rauchwarnmelder installiert. Der Mieter ist verpflichtet, "
            "die Funktionsfähigkeit der Rauchwarnmelder regelmäßig zu überprüfen und den "
            "Vermieter unverzüglich zu informieren, falls ein Gerät defekt ist. "
            "Das Entfernen oder Deaktivieren von Rauchwarnmeldern ist untersagt."
        )))

        story.append(section(16, "Hausordnung", get_para("p16",
            "Der Mieter verpflichtet sich, die Hausordnung in ihrer jeweils gültigen "
            "Fassung zu beachten. Sie ist Bestandteil dieses Mietvertrages. "
            "Die Hausordnung regelt insbesondere Ruhezeiten, Reinigungspflichten und "
            "die Nutzung der Gemeinschaftsflächen. Mittagsruhe ist von 13:00 bis 15:00 "
            "Uhr, Nachtruhe von 22:00 bis 07:00 Uhr einzuhalten."
        )))

        story.append(section(17, "Kündigung", get_para("p17",
            "Das Mietverhältnis kann vom Mieter mit einer Frist von drei Monaten zum "
            "Monatsende schriftlich gekündigt werden. Der Vermieter kann das Mietverhältnis "
            "nur aus den gesetzlich vorgesehenen Gründen kündigen. Die Kündigung bedarf "
            "der Schriftform und ist an die Vertragsparteien zu richten."
        )))

        story.append(section(18, "Übergabe und Rückgabe", get_para("p18",
            "Zu Beginn des Mietverhältnisses wird ein Übergabeprotokoll erstellt, in dem "
            "der Zustand der Wohnung sowie die Zählerstände dokumentiert werden. "
            "Bei Beendigung des Mietverhältnisses ist die Wohnung besenrein und in "
            "ordnungsgemäßem Zustand zurückzugeben. Einbauten des Mieters sind bei "
            "Auszug zu entfernen, sofern der Vermieter nicht ausdrücklich deren "
            "Verbleib wünscht."
        )))

        story.append(section(19, "Datenschutz", get_para("p19",
            "Der Vermieter verarbeitet personenbezogene Daten des Mieters ausschließlich "
            "zur Durchführung des Mietvertrages und zur Erfüllung gesetzlicher Pflichten. "
            "Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO. Die Daten werden nicht an "
            "Dritte weitergegeben, soweit dies nicht zur Vertragsabwicklung erforderlich "
            "ist (z.B. Abrechnung der Betriebskosten). Der Mieter hat das Recht auf "
            "Auskunft, Berichtigung, Löschung und Widerspruch gemäß DSGVO."
        )))

        special_text = special_notes.strip() if special_notes else "Keine Sondervereinbarungen."
        story.append(section(20, "Sondervereinbarungen", get_para("p20", special_text)))

        story.append(Spacer(1, 8 * mm))
        story.append(HRFlowable(width="100%", thickness=0.5, color=hex_color("#cbd5e1"), spaceAfter=6))

        # ─── Unterschriften-Block ──────────────────────────────────
        story.append(Paragraph("Unterschriften", head_sty))
        story.append(Paragraph(
            "Beide Parteien erklären sich mit dem Inhalt dieses Mietvertrages einverstanden "
            "und bestätigen den Erhalt einer Ausfertigung.",
            sty("SignNote", fontSize=8.5, leading=12, spaceAfter=6)
        ))

        today_str = datetime.now().strftime("%d.%m.%Y")
        signed_date_str = signed_at.strftime("%d.%m.%Y") if signed_at else today_str
        landlord_date_str = landlord_signed_at.strftime("%d.%m.%Y") if landlord_signed_at else today_str

        # Signature line height – both sides use identical spacing so the HR lines align
        _SIG_SPACE = 20 * mm   # space reserved for handwritten / image signature
        _DATE_H = 13           # height of the date paragraph line (points)

        # Build landlord block
        if landlord_signature_b64:
            try:
                ll_sig_img = Image(_sig_to_white_bg(landlord_signature_b64), width=8 * cm, height=2 * cm)
                ll_sig_img.hAlign = "LEFT"
                vermieter_block = [
                    Paragraph(
                        f"Überherrn, {landlord_date_str}",
                        sty("SigLoc", fontSize=9, leading=_DATE_H)
                    ),
                    ll_sig_img,
                    HRFlowable(width=8 * cm, thickness=0.5, color=hex_color("#94a3b8"), spaceAfter=2),
                    Paragraph("Alexander Klingel (Vermieter)", small_sty),
                    Paragraph(f"Digitale Signatur – {landlord_date_str}", small_sty),
                ]
            except Exception:
                vermieter_block = [
                    Paragraph(
                        f"Überherrn, {today_str}",
                        sty("SigLocFallback", fontSize=9, leading=_DATE_H)
                    ),
                    Spacer(1, _SIG_SPACE),
                    HRFlowable(width=8 * cm, thickness=0.5, color=hex_color("#94a3b8"), spaceAfter=2),
                    Paragraph("Alexander Klingel (Vermieter)", small_sty),
                ]
        else:
            vermieter_block = [
                Paragraph(
                    f"Überherrn, {today_str}",
                    sty("SigLoc", fontSize=9, leading=_DATE_H)
                ),
                Spacer(1, _SIG_SPACE),
                HRFlowable(width=8 * cm, thickness=0.5, color=hex_color("#94a3b8"), spaceAfter=2),
                Paragraph("Alexander Klingel (Vermieter)", small_sty),
            ]

        # Build tenant signature block
        if tenant_signature_b64:
            try:
                sig_img = Image(_sig_to_white_bg(tenant_signature_b64), width=8 * cm, height=2 * cm)
                sig_img.hAlign = "LEFT"
                mieter_block = [
                    Paragraph(
                        f"Überherrn, {signed_date_str}",
                        sty("SigLoc2", fontSize=9, leading=_DATE_H)
                    ),
                    sig_img,
                    HRFlowable(width=8 * cm, thickness=0.5, color=hex_color("#94a3b8"), spaceAfter=2),
                    Paragraph(f"{tenant_name} (Mieter)", small_sty),
                ]
                if signed_ip:
                    mieter_block.append(
                        Paragraph(f"Digitale Signatur – IP: {signed_ip}  |  {signed_date_str}", small_sty)
                    )
            except Exception:
                # compensate for missing date paragraph so HR stays aligned
                mieter_block = [
                    Spacer(1, _DATE_H + _SIG_SPACE),
                    HRFlowable(width=8 * cm, thickness=0.5, color=hex_color("#94a3b8"), spaceAfter=2),
                    Paragraph(f"{tenant_name} (Mieter)", small_sty),
                ]
        else:
            # No tenant signature yet – no date shown on this side (date is only on landlord side)
            mieter_block = [
                Spacer(1, _DATE_H + _SIG_SPACE),
                HRFlowable(width=8 * cm, thickness=0.5, color=hex_color("#94a3b8"), spaceAfter=2),
                Paragraph(f"{tenant_name} (Mieter)", small_sty),
            ]

        sig_tbl = Table(
            [[vermieter_block, mieter_block]],
            colWidths=[(W - 5 * cm) / 2, (W - 5 * cm) / 2],
        )
        sig_tbl.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 12),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ]))
        story.append(sig_tbl)

        story.append(Spacer(1, 6 * mm))
        story.append(HRFlowable(width="100%", thickness=0.5,
                                color=hex_color("#e2e8f0"), spaceAfter=3))
        story.append(Paragraph(
            f"Erstellt am {today_str}  ·  Nebenkosten-Portal  ·  Hauptstraße 15, 66802 Überherrn",
            small_c
        ))

        if is_demo:
            def add_watermark(canvas_obj, doc_obj):
                canvas_obj.saveState()
                canvas_obj.setFont("Helvetica-Bold", 72)
                canvas_obj.setFillColorRGB(0.85, 0.85, 0.85, alpha=0.35)
                canvas_obj.translate(W / 2, H / 2)
                canvas_obj.rotate(45)
                canvas_obj.drawCentredString(0, 0, "VORSCHAU")
                canvas_obj.restoreState()
            doc.build(story, onFirstPage=add_watermark, onLaterPages=add_watermark)
        else:
            doc.build(story)
        logger.info(f"Rental contract PDF generated: {output_path}")
        return True

    except Exception as e:
        logger.error(f"Rental contract PDF generation failed: {e}", exc_info=True)
        return False
