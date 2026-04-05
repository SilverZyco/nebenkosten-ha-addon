"""PDF generation for Hausunterlagen signature pages."""
import base64
import io
from datetime import datetime
from typing import Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
from reportlab.lib.enums import TA_CENTER, TA_LEFT


def generate_house_document_pdf(
    output_path: str,
    title: str,
    template_filename: str,
    tenant_name: str,
    apartment_label: str,
    document_text: str = "",
    tenant_signature_b64: Optional[str] = None,
    tenant_signed_at: Optional[datetime] = None,
    tenant_signed_ip: Optional[str] = None,
    landlord_signature_b64: Optional[str] = None,
    landlord_signed_at: Optional[datetime] = None,
) -> bool:
    try:
        doc = SimpleDocTemplate(
            output_path,
            pagesize=A4,
            leftMargin=2 * cm,
            rightMargin=2 * cm,
            topMargin=2 * cm,
            bottomMargin=2 * cm,
        )

        st_title = ParagraphStyle("title", fontSize=16, fontName="Helvetica-Bold", spaceAfter=6)
        st_sub = ParagraphStyle("sub", fontSize=9, fontName="Helvetica", spaceAfter=4,
                                textColor=colors.HexColor("#666666"))
        st_body = ParagraphStyle("body", fontSize=9.5, fontName="Helvetica", spaceAfter=6, leading=14)
        st_pre = ParagraphStyle("pre", fontSize=9, fontName="Helvetica", spaceAfter=3, leading=13)
        st_label = ParagraphStyle("label", fontSize=9.5, fontName="Helvetica-Bold", spaceAfter=3)
        st_small = ParagraphStyle("small", fontSize=8, fontName="Helvetica",
                                  textColor=colors.HexColor("#666666"))

        story = []

        # Logo top right
        from app.services.pdf_logo import get_logo_image
        logo = get_logo_image()
        if logo:
            logo_table = Table([[logo]], colWidths=[16.5 * cm])
            logo_table.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "RIGHT")]))
            story.append(logo_table)

        # Header
        story.append(Paragraph("Hausunterlage", st_sub))
        story.append(Paragraph(title, st_title))
        story.append(Spacer(1, 0.3 * cm))

        # Info table
        info_data = [
            ["Vermieter:", "Alexander Klingel, Nauwies 7, 66802 Überherrn"],
            ["Mieter:", tenant_name],
            ["Wohnung:", apartment_label],
        ]
        info_table = Table(info_data, colWidths=[3.5 * cm, 13.5 * cm])
        info_table.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
            ("FONTNAME", (1, 0), (1, -1), "Helvetica"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("TOPPADDING", (0, 0), (-1, -1), 2),
        ]))
        story.append(info_table)
        story.append(Spacer(1, 0.4 * cm))

        # Document text
        if document_text:
            story.append(Paragraph("Inhalt:", st_label))
            # Split into lines and render, handling HTML-unsafe chars
            for line in document_text.split("\n"):
                clean = line.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                if clean.strip():
                    story.append(Paragraph(clean, st_pre))
                else:
                    story.append(Spacer(1, 0.15 * cm))
            story.append(Spacer(1, 0.5 * cm))

        # Confirmation text
        story.append(Paragraph(
            "Der Mieter bestätigt hiermit, dass er das obige Dokument vollständig "
            "erhalten und zur Kenntnis genommen hat. Der Inhalt wurde verstanden und akzeptiert.",
            st_body,
        ))
        story.append(Spacer(1, 0.6 * cm))

        # Signature helper
        def _sig_image(b64: str, max_w: float = 5 * cm, max_h: float = 1.8 * cm) -> Optional[Image]:
            try:
                data = base64.b64decode(b64.split(",")[-1])
                buf = io.BytesIO(data)
                img = Image(buf, width=max_w, height=max_h)
                img.hAlign = "LEFT"
                return img
            except Exception:
                return None

        # Tenant signature
        story.append(Paragraph("Unterschrift Mieter:", st_label))
        if tenant_signature_b64:
            sig_img = _sig_image(tenant_signature_b64)
            if sig_img:
                story.append(sig_img)
            if tenant_signed_at:
                signed_str = tenant_signed_at.strftime("%d.%m.%Y %H:%M Uhr")
                ip_str = ""
                if tenant_signed_ip and tenant_signed_ip != "admin-portal":
                    ip_str = " (IP: " + tenant_signed_ip + ")"
                story.append(Paragraph("Unterzeichnet am " + signed_str + ip_str, st_small))
        else:
            story.append(Spacer(1, 1.5 * cm))
            story.append(Paragraph("______________________________", st_body))
            story.append(Paragraph("Datum, Unterschrift Mieter", st_small))

        story.append(Spacer(1, 0.6 * cm))

        # Landlord signature
        story.append(Paragraph("Unterschrift Vermieter:", st_label))
        if landlord_signature_b64:
            sig_img = _sig_image(landlord_signature_b64)
            if sig_img:
                story.append(sig_img)
            if landlord_signed_at:
                signed_str = landlord_signed_at.strftime("%d.%m.%Y %H:%M Uhr")
                story.append(Paragraph("Unterzeichnet am " + signed_str, st_small))
        else:
            story.append(Spacer(1, 1.5 * cm))
            story.append(Paragraph("______________________________", st_body))
            story.append(Paragraph("Datum, Unterschrift Vermieter (Alexander Klingel)", st_small))

        doc.build(story)
        return True

    except Exception as e:
        print(f"[house_document_pdf] Error: {e}")
        return False
