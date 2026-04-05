"""PDF generation for Mieterhöhungsschreiben (rent increase notice) using ReportLab."""
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

FLOOR_LABELS = {
    "EG": "Erdgeschoss",
    "OG": "Obergeschoss",
    "DG": "Dachgeschoss",
    "DU": "Büro",
}


def generate_rent_increase_pdf(
    output_path: str,
    tenant_name: str,
    tenant_address1: Optional[str],
    apartment_code: str,
    apartment_name: str,
    old_monthly_rent: Decimal,
    old_advance_payment: Decimal,
    new_monthly_rent: Decimal,
    new_advance_payment: Decimal,
    effective_date,
    reason: Optional[str],
    tenant_signature_b64: Optional[str] = None,
    signed_at: Optional[datetime] = None,
    signed_ip: Optional[str] = None,
) -> bool:
    """Generate a formal German Mieterhöhungsschreiben as PDF."""
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
        norm_left_sty = sty("NormLeft", fontSize=9, leading=13, alignment=TA_LEFT)

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
        today_str = datetime.now().strftime("%d.%m.%Y")
        floor_label = FLOOR_LABELS.get(apartment_code, apartment_code or "Wohnung")

        lh_data = [[
            Paragraph(
                "<b>Vermieter:</b><br/>Alexander Klingel<br/>Hauptstraße 15<br/>66802 Überherrn",
                sty("Sender", fontSize=8.5, leading=13, textColor=hex_color(COL_GRAY))
            ),
            Paragraph(f"Überherrn, {today_str}", sty("DateRight", fontSize=9, leading=13, alignment=TA_RIGHT)),
        ]]
        lh_tbl = Table(lh_data, colWidths=[9 * cm, None])
        lh_tbl.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
        ]))
        story.append(lh_tbl)
        story.append(Spacer(1, 3 * mm))
        story.append(HRFlowable(width="100%", thickness=3,
                                color=hex_color(COL_MID), spaceAfter=8))

        # ─── Document title ────────────────────────────────────────
        story.append(Paragraph("Mieterhöhungsschreiben", title_sty))
        story.append(Spacer(1, 2 * mm))

        # ─── Tenant address block ──────────────────────────────────
        tenant_addr_lines = [tenant_name]
        if tenant_address1:
            tenant_addr_lines.append(tenant_address1)
        tenant_addr_lines.append(f"Wohnung: {apartment_name} – {floor_label}")

        story.append(Paragraph(
            "<br/>".join(tenant_addr_lines),
            sty("TenantAddr", fontSize=9, leading=14, spaceBefore=2, spaceAfter=6)
        ))

        story.append(Spacer(1, 3 * mm))

        # ─── Subject line ──────────────────────────────────────────
        story.append(Paragraph(
            f"<b>Mieterhöhung gemäß § 558 BGB – Wohnung {apartment_code} {floor_label}</b>",
            sty("Subject", fontSize=11, leading=15, textColor=hex_color(COL_DARK),
                spaceBefore=2, spaceAfter=6)
        ))

        story.append(Paragraph(f"Sehr geehrte(r) {tenant_name},", norm_left_sty))
        story.append(Spacer(1, 3 * mm))

        story.append(Paragraph(
            "hiermit teile ich Ihnen mit, dass ich gemäß § 558 BGB eine Anpassung der Miete an die "
            "ortsübliche Vergleichsmiete vornehme. Die Einzelheiten entnehmen Sie bitte der folgenden Übersicht:",
            norm_sty
        ))
        story.append(Spacer(1, 4 * mm))

        # ─── Current rent table ────────────────────────────────────
        story.append(Paragraph("Bisherige Miete:", head_sty))

        old_total = old_monthly_rent + old_advance_payment
        old_rent_data = [
            ["Kaltmiete (bisher)", _fmt_eur(old_monthly_rent)],
            ["NK-Vorauszahlung (bisher)", _fmt_eur(old_advance_payment)],
            ["Gesamtmiete (bisher)", _fmt_eur(old_total)],
        ]
        old_tbl = Table(old_rent_data, colWidths=[8 * cm, 4 * cm])
        old_tbl.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), hex_color(COL_LGRAY)),
            ("GRID", (0, 0), (-1, -1), 0.3, hex_color("#e5e7eb")),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("FONTNAME", (1, 0), (1, -1), "Helvetica-Bold"),
            ("ALIGN", (1, 0), (1, -1), "RIGHT"),
            ("BACKGROUND", (0, 2), (-1, 2), hex_color("#e5e7eb")),
        ]))
        story.append(old_tbl)
        story.append(Spacer(1, 4 * mm))

        # ─── New rent table ────────────────────────────────────────
        story.append(Paragraph("Neue Miete ab " + _fmt_date(effective_date) + ":", head_sty))

        new_total = new_monthly_rent + new_advance_payment
        diff_rent = new_monthly_rent - old_monthly_rent
        diff_adv = new_advance_payment - old_advance_payment
        diff_total = new_total - old_total

        new_rent_data = [
            ["Kaltmiete (neu)", _fmt_eur(new_monthly_rent)],
            ["NK-Vorauszahlung (neu)", _fmt_eur(new_advance_payment)],
            ["Gesamtmiete (neu)", _fmt_eur(new_total)],
        ]
        new_tbl = Table(new_rent_data, colWidths=[8 * cm, 4 * cm])
        new_tbl.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), hex_color("#eff6ff")),
            ("GRID", (0, 0), (-1, -1), 0.3, hex_color("#bfdbfe")),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("FONTNAME", (1, 0), (1, -1), "Helvetica-Bold"),
            ("FONTNAME", (0, 2), (1, 2), "Helvetica-Bold"),
            ("ALIGN", (1, 0), (1, -1), "RIGHT"),
            ("TEXTCOLOR", (0, 2), (-1, 2), hex_color(COL_DARK)),
            ("BACKGROUND", (0, 2), (-1, 2), hex_color("#dbeafe")),
        ]))
        story.append(new_tbl)
        story.append(Spacer(1, 3 * mm))

        # ─── Difference summary ────────────────────────────────────
        diff_sign = "+" if diff_total >= 0 else ""
        story.append(Paragraph(
            f"<b>Erhöhung gesamt: {diff_sign}{_fmt_eur(diff_total)} monatlich</b> "
            f"(Kaltmiete: {diff_sign}{_fmt_eur(diff_rent)}, "
            f"NK-Vorauszahlung: {'+'  if diff_adv >= 0 else ''}{_fmt_eur(diff_adv)})",
            sty("Diff", fontSize=9, leading=13, textColor=hex_color(COL_MID),
                spaceBefore=2, spaceAfter=6)
        ))

        # ─── Effective date prominent ──────────────────────────────
        story.append(Paragraph(
            f"<b>Wirksam ab: {_fmt_date(effective_date)}</b>",
            sty("EffDate", fontSize=10, leading=14, textColor=hex_color(COL_DARK),
                spaceBefore=2, spaceAfter=6)
        ))

        # ─── Reason ───────────────────────────────────────────────
        if reason and reason.strip():
            story.append(Paragraph("Begründung:", head_sty))
            story.append(Paragraph(reason.strip(), norm_sty))
            story.append(Spacer(1, 3 * mm))

        # ─── Legal basis ───────────────────────────────────────────
        story.append(Paragraph("Rechtliche Hinweise:", head_sty))
        story.append(Paragraph(
            "Diese Mieterhöhung erfolgt gemäß § 558 BGB (Anpassung an die ortsübliche Vergleichsmiete). "
            "Sie haben das Recht, der Mieterhöhung bis zum Ende des übernächsten Monats nach Zugang dieses "
            "Schreibens zuzustimmen. Stimmen Sie der Mieterhöhung nicht zu, bin ich berechtigt, innerhalb von "
            "drei weiteren Monaten auf Erteilung der Zustimmung zu klagen (§ 558b Abs. 2 BGB). "
            "Die erhöhte Miete wird ab dem in diesem Schreiben genannten Datum fällig, sofern Sie die "
            "Erhöhung akzeptiert haben.",
            norm_sty
        ))
        story.append(Spacer(1, 4 * mm))

        # ─── Consent line ──────────────────────────────────────────
        story.append(Paragraph(
            "Bitte bestätigen Sie Ihr Einverständnis mit der Mieterhöhung durch Ihre Unterschrift unten.",
            norm_sty
        ))

        story.append(Spacer(1, 8 * mm))
        story.append(HRFlowable(width="100%", thickness=0.5, color=hex_color("#cbd5e1"), spaceAfter=6))

        # ─── Signature block ───────────────────────────────────────
        story.append(Paragraph("Unterschriften", head_sty))

        signed_date_str = signed_at.strftime("%d.%m.%Y") if signed_at else today_str

        _SIG_SPACE = 20 * mm
        _DATE_H = 13

        # Vermieter block (left)
        vermieter_block = [
            Paragraph(
                f"Überherrn, {today_str}",
                sty("SigLoc", fontSize=9, leading=_DATE_H)
            ),
            Spacer(1, _SIG_SPACE),
            HRFlowable(width=8 * cm, thickness=0.5, color=hex_color("#94a3b8"), spaceAfter=2),
            Paragraph("Alexander Klingel (Vermieter)", small_sty),
        ]

        # Mieter block (right)
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
                mieter_block = [
                    Spacer(1, _DATE_H + _SIG_SPACE),
                    HRFlowable(width=8 * cm, thickness=0.5, color=hex_color("#94a3b8"), spaceAfter=2),
                    Paragraph(f"{tenant_name} (Mieter)", small_sty),
                ]
        else:
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

        doc.build(story)
        logger.info(f"Rent increase PDF generated: {output_path}")
        return True

    except Exception as e:
        logger.error(f"Rent increase PDF generation failed: {e}", exc_info=True)
        return False
