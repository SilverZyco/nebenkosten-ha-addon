"""PDF receipt for billing settlement payments."""
import base64
import io
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT


def _fmt_eur(v) -> str:
    d = Decimal(str(v))
    s = f"{d:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return s + " \u20ac"


def generate_billing_receipt_pdf(
    output_path: str,
    year: int,
    apartment_code: str,
    apartment_label: str,
    tenant_name: str,
    total_costs: Decimal,
    advance_payments: Decimal,
    balance: Decimal,
    payment_method: str,          # "bar" or "ueberweisung"
    payment_date: date,
    notes: str = "",
    signature_b64: Optional[str] = None,
    signed_at: Optional[datetime] = None,
) -> bool:
    try:
        doc = SimpleDocTemplate(
            output_path,
            pagesize=A4,
            leftMargin=2.5 * cm,
            rightMargin=2.5 * cm,
            topMargin=2.5 * cm,
            bottomMargin=2.5 * cm,
        )

        st_title = ParagraphStyle("title", fontSize=16, fontName="Helvetica-Bold", spaceAfter=4)
        st_sub = ParagraphStyle("sub", fontSize=9, fontName="Helvetica", spaceAfter=2,
                                textColor=colors.HexColor("#666666"))
        st_body = ParagraphStyle("body", fontSize=10, fontName="Helvetica", spaceAfter=6, leading=14)
        st_label = ParagraphStyle("label", fontSize=9, fontName="Helvetica-Bold", spaceAfter=2)
        st_small = ParagraphStyle("small", fontSize=8, fontName="Helvetica",
                                  textColor=colors.HexColor("#666666"))
        st_amount = ParagraphStyle("amount", fontSize=14, fontName="Helvetica-Bold",
                                   spaceAfter=4, alignment=TA_CENTER)

        balance_val = float(balance)
        is_nachzahlung = balance_val > 0   # tenant pays
        is_erstattung = balance_val < 0    # landlord pays back

        story = []

        # Logo top right
        from app.services.pdf_logo import get_logo_image
        logo = get_logo_image()
        if logo:
            logo_table = Table([[logo]], colWidths=[16.5 * cm])
            logo_table.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "RIGHT")]))
            story.append(logo_table)

        # Header
        story.append(Paragraph("Quittung", st_sub))
        story.append(Paragraph(f"Nebenkostenabrechnung {year}", st_title))
        story.append(Spacer(1, 0.4 * cm))

        # Parties table
        parties = [
            ["Vermieter:", "Alexander Klingel, Nauwies 7, 66802 Überherrn"],
            ["Mieter:", tenant_name or "-"],
            ["Wohnung:", apartment_label or apartment_code or "-"],
        ]
        pt = Table(parties, colWidths=[3.5 * cm, 13 * cm])
        pt.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("TOPPADDING", (0, 0), (-1, -1), 2),
        ]))
        story.append(pt)
        story.append(Spacer(1, 0.5 * cm))

        # Cost summary
        summary_data = [
            ["Betriebskosten gesamt:", _fmt_eur(total_costs)],
            ["Geleistete Vorauszahlungen:", "- " + _fmt_eur(advance_payments)],
            ["", ""],
            ["Saldo:", ("+ " if balance_val > 0 else "") + _fmt_eur(balance)],
        ]
        st = Table(summary_data, colWidths=[10 * cm, 6.5 * cm])
        st.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
            ("FONTNAME", (0, 3), (-1, 3), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 10),
            ("ALIGN", (1, 0), (1, -1), "RIGHT"),
            ("LINEABOVE", (0, 3), (-1, 3), 0.5, colors.black),
            ("LINEBELOW", (0, 3), (-1, 3), 0.5, colors.black),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("TEXTCOLOR", (0, 3), (-1, 3),
             colors.HexColor("#c0392b") if is_nachzahlung else
             (colors.HexColor("#27ae60") if is_erstattung else colors.black)),
        ]))
        story.append(st)
        story.append(Spacer(1, 0.5 * cm))

        # Direction + amount highlight
        if is_nachzahlung:
            direction_text = f"<b>Nachzahlung durch Mieter: {_fmt_eur(balance)}</b>"
        elif is_erstattung:
            direction_text = f"<b>Erstattung durch Vermieter: {_fmt_eur(abs(balance_val))}</b>"
        else:
            direction_text = "<b>Kein Ausgleich erforderlich (Saldo = 0,00 EUR)</b>"

        story.append(Paragraph(direction_text, ParagraphStyle(
            "dir", fontSize=11, fontName="Helvetica-Bold",
            textColor=colors.HexColor("#c0392b") if is_nachzahlung else
                      (colors.HexColor("#27ae60") if is_erstattung else colors.black),
            spaceAfter=8, borderPad=6,
        )))

        # Payment details
        payment_method_label = "Barzahlung" if payment_method == "bar" else "Überweisung"
        payment_date_str = payment_date.strftime("%d.%m.%Y") if payment_date else "-"

        pay_data = [
            ["Zahlungsart:", payment_method_label],
            ["Datum:", payment_date_str],
        ]
        if notes:
            pay_data.append(["Hinweis:", notes])

        pdt = Table(pay_data, colWidths=[3.5 * cm, 13 * cm])
        pdt.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("TOPPADDING", (0, 0), (-1, -1), 2),
        ]))
        story.append(pdt)
        story.append(Spacer(1, 0.6 * cm))

        # Confirmation text
        if is_nachzahlung:
            confirm = (
                f"Der Vermieter bestätigt den Erhalt der Nachzahlung in Höhe von {_fmt_eur(balance)} "
                f"am {payment_date_str} per {payment_method_label}."
            )
        elif is_erstattung:
            confirm = (
                f"Der Vermieter bestätigt die Auszahlung des Guthabens in Höhe von "
                f"{_fmt_eur(abs(balance_val))} an den Mieter am {payment_date_str} per {payment_method_label}."
            )
        else:
            confirm = "Der Saldo beträgt 0,00 EUR. Es ist keine Zahlung erforderlich."

        story.append(Paragraph(confirm, st_body))
        story.append(Spacer(1, 0.6 * cm))

        # Signature
        def _sig_image(b64: str, max_w: float = 5 * cm, max_h: float = 1.8 * cm) -> Optional[Image]:
            try:
                data = base64.b64decode(b64.split(",")[-1])
                buf = io.BytesIO(data)
                img = Image(buf, width=max_w, height=max_h)
                img.hAlign = "LEFT"
                return img
            except Exception:
                return None

        story.append(Paragraph("Unterschrift Vermieter:", st_label))
        if signature_b64:
            sig_img = _sig_image(signature_b64)
            if sig_img:
                story.append(sig_img)
            if signed_at:
                story.append(Paragraph(
                    "Unterzeichnet am " + signed_at.strftime("%d.%m.%Y %H:%M Uhr"),
                    st_small
                ))
        else:
            story.append(Spacer(1, 1.5 * cm))
            story.append(Paragraph("______________________________", st_body))
            story.append(Paragraph("Datum, Unterschrift Vermieter (Alexander Klingel)", st_small))

        doc.build(story)
        return True
    except Exception as e:
        print(f"[billing_receipt_pdf] Error: {e}")
        return False
