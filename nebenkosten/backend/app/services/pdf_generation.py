"""PDF generation for Nebenkostenabrechnung using ReportLab."""
import os
import logging
from typing import Dict, Any, Optional
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

from .pdf_utils import (
    COL_DARK, COL_MID, COL_LIGHT, COL_GREEN, COL_RED, COL_GRAY, COL_LGRAY,
    _fmt_eur, _fmt_date, _fmt_iban,
)

logger = logging.getLogger(__name__)

# Backwards-compatible alias (used throughout this file)
_format_eur = _fmt_eur


def generate_billing_pdf(
    apartment_billing: Dict[str, Any],
    output_path: str,
    house_address: str = "",
    owner_name: str = "",
    rental_address: str = "",
    bank_name: str = "",
    bank_iban: str = "",
    bank_bic: str = "",
    bank_account_holder: str = "",
) -> bool:
    """Generate a Nebenkostenabrechnung PDF."""
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib import colors
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import cm, mm
        from reportlab.platypus import (
            SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
            HRFlowable, KeepTogether
        )
        from reportlab.lib.enums import TA_LEFT, TA_RIGHT, TA_CENTER, TA_JUSTIFY

        W, H = A4  # 595.27 x 841.89

        doc = SimpleDocTemplate(
            output_path,
            pagesize=A4,
            rightMargin=1.5 * cm,
            leftMargin=1.5 * cm,
            topMargin=1.4 * cm,
            bottomMargin=1.4 * cm,
        )

        # ── Colour helpers ────────────────────────────────────
        def hex_color(h: str):
            return colors.HexColor(h)

        # ── Styles ───────────────────────────────────────────
        S = getSampleStyleSheet()

        def sty(name, **kw):
            base = kw.pop("parent", S["Normal"])
            return ParagraphStyle(name, parent=base, **kw)

        title_sty = sty("Title2",
            fontSize=15, leading=18,
            textColor=hex_color(COL_DARK),
            fontName="Helvetica-Bold", spaceAfter=1)

        sub_sty = sty("Sub",
            fontSize=8, leading=11,
            textColor=hex_color(COL_GRAY))

        head_sty = sty("Head",
            fontSize=9.5, leading=12,
            textColor=hex_color(COL_DARK),
            fontName="Helvetica-Bold",
            spaceBefore=7, spaceAfter=2)

        norm_sty = sty("Norm", fontSize=8.5, leading=11)
        norm_b_sty = sty("NormB", fontSize=8.5, leading=11, fontName="Helvetica-Bold")

        right_sty = sty("Right", fontSize=8.5, leading=11, alignment=TA_RIGHT)
        right_b_sty = sty("RightB", fontSize=8.5, leading=11,
                          fontName="Helvetica-Bold", alignment=TA_RIGHT)

        small_sty = sty("Small", fontSize=7, leading=9.5,
                        textColor=hex_color(COL_GRAY))
        small_c_sty = sty("SmallC", fontSize=7, leading=9.5,
                          textColor=hex_color(COL_GRAY), alignment=TA_CENTER)

        info_key_sty = sty("InfoKey", fontSize=7.5, leading=10,
                           textColor=hex_color(COL_GRAY))
        info_val_sty = sty("InfoVal", fontSize=7.5, leading=10,
                           fontName="Helvetica-Bold")

        # ── Data ─────────────────────────────────────────────
        data = apartment_billing
        year        = data.get("year", "")
        apt_code    = data.get("apartment_code", "")
        tenant_name = data.get("tenant_name", "Mieter")
        t_start     = data.get("tenancy_start", "")
        t_end       = data.get("tenancy_end", "")
        advance     = Decimal(str(data.get("advance_payments", "0")))
        balance     = Decimal(str(data.get("balance", "0")))
        breakdown   = data.get("cost_breakdown", {})

        story = []

        # Logo top right
        from app.services.pdf_logo import get_logo_image
        from reportlab.platypus import Image as RLImage
        logo = get_logo_image()
        if logo:
            logo_table = Table([[logo]], colWidths=[16.5 * cm])
            logo_table.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "RIGHT")]))
            story.append(logo_table)

        # ── ① Letterhead ─────────────────────────────────────
        # Two-column: left = sender info, right = title block
        sender_lines = []
        if owner_name:
            sender_lines.append(f"<b>{owner_name}</b>")
        if house_address:
            for part in house_address.split(","):
                sender_lines.append(part.strip())
        sender_text = "<br/>".join(sender_lines) if sender_lines else ""

        lh_data = [[
            Paragraph(sender_text, sty("Sender", fontSize=8.5, leading=13, textColor=hex_color(COL_GRAY))),
            Paragraph("Nebenkostenabrechnung", title_sty),
        ]]
        lh_tbl = Table(lh_data, colWidths=[7*cm, None])
        lh_tbl.setStyle(TableStyle([
            ("VALIGN", (0,0), (-1,-1), "BOTTOM"),
            ("LEFTPADDING",  (0,0), (-1,-1), 0),
            ("RIGHTPADDING", (0,0), (-1,-1), 0),
            ("BOTTOMPADDING",(0,0), (-1,-1), 0),
            ("TOPPADDING",   (0,0), (-1,-1), 0),
        ]))
        story.append(lh_tbl)
        story.append(Spacer(1, 2*mm))

        # Thick accent rule
        story.append(HRFlowable(width="100%", thickness=2,
                                color=hex_color(COL_MID), spaceAfter=4))

        # ── ② Info row ────────────────────────────────────────
        def info_cell(label, value):
            return [Paragraph(label, info_key_sty), Paragraph(str(value), info_val_sty)]

        mietzeit = f"{_fmt_date(t_start)} – {_fmt_date(t_end)}" if t_start and t_end else "–"

        info_labels = ["Wohnung", "Mieter", "Abrechnungsjahr", "Mietzeit im Jahr"]
        info_vals   = [str(apt_code), str(tenant_name), str(year), mietzeit]
        if rental_address:
            info_labels.append("Mietobjekt")
            info_vals.append(rental_address)

        info_data = [
            [Paragraph(lbl, info_key_sty) for lbl in info_labels],
            [Paragraph(val, info_val_sty) for val in info_vals],
        ]
        cw = (W - 4.4*cm) / len(info_labels)
        info_tbl = Table(info_data, colWidths=[cw]*len(info_labels))
        info_tbl.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (-1,0), hex_color(COL_LGRAY)),
            ("BACKGROUND", (0,1), (-1,1), colors.white),
            ("GRID",       (0,0), (-1,-1), 0.3, hex_color("#e5e7eb")),
            ("TOPPADDING",    (0,0), (-1,-1), 3),
            ("BOTTOMPADDING", (0,0), (-1,-1), 3),
            ("LEFTPADDING",   (0,0), (-1,-1), 6),
            ("RIGHTPADDING",  (0,0), (-1,-1), 6),
            ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
        ]))
        story.append(info_tbl)
        story.append(Spacer(1, 3*mm))

        # ── ③ Cost table ──────────────────────────────────────
        story.append(Paragraph("Kostenaufstellung", head_sty))

        CATEGORY_LABELS = {
            "water":              "Wasserversorgung",
            "gas":                "Heizung / Gas",
            "rainwater":          "Niederschlagswasser",
            "electricity_common": "Allgemeinstrom",
            "property_tax":       "Grundsteuer (Anteil)",
            "insurance":          "Gebäudeversicherung",
            "maintenance":        "Wartung / Instandhaltung",
            "chimney_sweep":      "Schornsteinfeger",
            "heating_other":      "Sonstige Heizungskosten",
            "waste":              "Müllentsorgung (EVS)",
        }

        tbl_header = [
            Paragraph("<b>Position</b>",  sty("TH", fontSize=9, fontName="Helvetica-Bold",
                                               textColor=colors.white)),
            Paragraph("<b>Details</b>",   sty("TH2", fontSize=9, fontName="Helvetica-Bold",
                                               textColor=colors.white)),
            Paragraph("<b>Betrag</b>",    sty("TH3", fontSize=9, fontName="Helvetica-Bold",
                                               textColor=colors.white, alignment=TA_RIGHT)),
        ]
        rows = [tbl_header]
        total_costs = Decimal("0")

        for cat, cat_data in breakdown.items():
            cost = Decimal(str(cat_data.get("cost", "0") if isinstance(cat_data, dict) else cat_data))
            if cost == 0:
                continue

            label  = CATEGORY_LABELS.get(cat, cat.replace("_", " ").title())
            detail = ""

            if cat == "water" and isinstance(cat_data, dict):
                m3  = cat_data.get("m3_adjusted", "")
                fac = cat_data.get("factor", "")
                ppm = cat_data.get("price_per_m3", "")
                parts = []
                if m3:
                    parts.append(f"Verbrauch: <b>{m3} m³</b>")
                if ppm:
                    parts.append(f"Preis: {_format_eur(ppm)}/m³")
                if fac and fac != "1" and fac != "1.0000":
                    parts.append(f"Korrekturfaktor: {fac}")
                detail = "  ·  ".join(parts)
            elif cat == "gas" and isinstance(cat_data, dict):
                kwh = cat_data.get("kwh_adjusted", "")
                fac = cat_data.get("factor", "")
                parts = []
                if kwh:
                    parts.append(f"Verbrauch: <b>{kwh} kWh</b>")
                if fac and fac != "1" and fac != "1.0000":
                    parts.append(f"Korrekturfaktor: {fac}")
                detail = "  ·  ".join(parts)
            elif cat == "waste" and isinstance(cat_data, dict):
                parts = []
                for wl in cat_data.get("lines", []):
                    bid   = wl.get("bin_id", "")
                    bsize = wl.get("bin_size", "")
                    share = wl.get("share_n", 1)
                    wamt  = wl.get("amount", wl.get("cost", ""))
                    if share > 1:
                        # Shared bin (Biotonne): only show share info, no emptying details
                        line = f"Tonne {bid}"
                        if bsize:
                            line += f" ({bsize})"
                        line += f"  –  <b>1/{share} Anteil: {_format_eur(wamt)}</b>"
                        parts.append(line)
                    else:
                        # Individual bin: show emptying details
                        total_emp = wl.get("total_emptyings", 0)
                        hdr = f"<b>Tonne {bid}"
                        if bsize:
                            hdr += f" ({bsize})"
                        hdr += f"  –  {total_emp} Leerung{'en' if total_emp != 1 else ''}</b>"
                        parts.append(hdr)
                        for emp in wl.get("emptyings", []):
                            cnt  = emp.get("count", 0)
                            desc = emp.get("description") or "Standardleerung"
                            ppx  = emp.get("price_per_emptying")
                            amt  = emp.get("amount")
                            if cnt:
                                if ppx and amt:
                                    parts.append(f"  {desc}: {cnt}× à {_format_eur(ppx)} = <b>{_format_eur(amt)}</b>")
                                else:
                                    parts.append(f"  {desc}: {cnt}×")
                        for emp in wl.get("extra_emptyings", []):
                            cnt  = emp.get("count", 0)
                            desc = emp.get("description") or "Zusatzleerung"
                            ppx  = emp.get("price_per_emptying")
                            amt  = emp.get("amount")
                            if cnt:
                                if ppx and amt:
                                    parts.append(f"  {desc} (Zusatz): {cnt}× à {_format_eur(ppx)} = <b>{_format_eur(amt)}</b>")
                                elif amt:
                                    parts.append(f"  {desc} (Zusatz): {cnt}× = <b>{_format_eur(amt)}</b>")
                detail = "<br/>".join(parts)
            elif isinstance(cat_data, dict) and "share" in cat_data:
                share     = cat_data.get("share", 1)
                total_s   = cat_data.get("total_shares", 1)
                detail = f"{share}/{total_s} Anteil (zeitanteilig)"

            rows.append([
                Paragraph(label, norm_sty),
                Paragraph(detail, small_sty),
                Paragraph(_format_eur(cost), right_sty),
            ])
            total_costs += cost

        # Subtotal separator + total row
        rows.append([
            Paragraph("<b>Gesamte Nebenkosten</b>", norm_b_sty),
            Paragraph("", norm_sty),
            Paragraph(f"<b>{_format_eur(total_costs)}</b>", right_b_sty),
        ])

        col_w = [5.5*cm, 9.0*cm, 2.8*cm]
        cost_tbl = Table(rows, colWidths=col_w, repeatRows=1)

        # Alternating row colours
        row_styles = [
            ("BACKGROUND",    (0,0), (-1,0),  hex_color(COL_DARK)),
            ("TEXTCOLOR",     (0,0), (-1,0),  colors.white),
            ("BACKGROUND",    (0,-1),(-1,-1), hex_color(COL_LIGHT)),
            ("FONTNAME",      (0,-1),(-1,-1), "Helvetica-Bold"),
            ("LINEABOVE",     (0,-1),(-1,-1), 1.2, hex_color(COL_MID)),
            ("GRID",          (0,0), (-1,-1), 0.25, hex_color("#e2e8f0")),
            ("VALIGN",        (0,0), (-1,-1), "TOP"),
            ("TOPPADDING",    (0,0), (-1,-1), 3),
            ("BOTTOMPADDING", (0,0), (-1,-1), 3),
            ("LEFTPADDING",   (0,0), (-1,-1), 5),
            ("RIGHTPADDING",  (0,0), (-1,-1), 5),
        ]
        for i, _ in enumerate(rows[1:-1], start=1):
            bg = colors.white if i % 2 == 1 else hex_color(COL_LIGHT)
            row_styles.append(("BACKGROUND", (0,i), (-1,i), bg))

        cost_tbl.setStyle(TableStyle(row_styles))
        story.append(cost_tbl)
        story.append(Spacer(1, 3*mm))

        # ── ④ Settlement box ──────────────────────────────────
        story.append(Paragraph("Abrechnung", head_sty))

        is_credit = balance <= 0
        balance_label = "Guthaben (Erstattung)" if is_credit else "Nachzahlung"
        balance_color = COL_GREEN if is_credit else COL_RED

        settle_rows = [
            [Paragraph("Gesamte Nebenkosten",      norm_sty),  Paragraph(_format_eur(total_costs), right_sty)],
            [Paragraph("Geleistete Vorauszahlungen", norm_sty), Paragraph(f"− {_format_eur(advance)}", right_sty)],
            [
                Paragraph(f"<b>{balance_label}</b>",
                          sty("BL", fontSize=11, fontName="Helvetica-Bold",
                              textColor=hex_color(balance_color))),
                Paragraph(f"<b>{_format_eur(abs(balance))}</b>",
                          sty("BR", fontSize=11, fontName="Helvetica-Bold",
                              textColor=hex_color(balance_color), alignment=TA_RIGHT)),
            ],
        ]
        settle_tbl = Table(settle_rows, colWidths=[12*cm, 4*cm])
        settle_tbl.setStyle(TableStyle([
            ("BACKGROUND",    (0,0),  (-1,1),  hex_color(COL_LGRAY)),
            ("BACKGROUND",    (0,-1), (-1,-1), colors.white),
            ("LINEABOVE",     (0,-1), (-1,-1), 1.5, hex_color(COL_DARK)),
            ("GRID",          (0,0),  (-1,-2), 0.25, hex_color("#e2e8f0")),
            ("TOPPADDING",    (0,0),  (-1,-1), 4),
            ("BOTTOMPADDING", (0,0),  (-1,-1), 4),
            ("LEFTPADDING",   (0,0),  (-1,-1), 8),
            ("RIGHTPADDING",  (0,0),  (-1,-1), 8),
            ("VALIGN",        (0,0),  (-1,-1), "MIDDLE"),
            ("ALIGN",         (1,0),  (1,-1),  "RIGHT"),
        ]))
        story.append(KeepTogether([settle_tbl]))
        story.append(Spacer(1, 3*mm))

        # ── ⑤ Payment notice / bank details ──────────────────
        has_bank = any([bank_name, bank_iban, bank_account_holder])
        if has_bank:
            story.append(HRFlowable(width="100%", thickness=0.5,
                                    color=hex_color("#cbd5e1"), spaceAfter=5))

            if not is_credit and balance > 0:
                notice = (
                    f"Bitte überweisen Sie den Nachzahlungsbetrag von "
                    f"<b>{_format_eur(abs(balance))}</b> "
                    f"innerhalb von <b>30 Tagen</b> auf folgendes Konto:"
                )
            else:
                notice = (
                    f"Das Guthaben von <b>{_format_eur(abs(balance))}</b> "
                    f"wird Ihnen in Kürze auf Ihr Konto erstattet."
                )
            story.append(Paragraph(notice,
                sty("Notice", fontSize=9, leading=13, spaceAfter=6)))

            if not is_credit and has_bank:
                bank_rows = []
                if bank_account_holder:
                    bank_rows.append(["Kontoinhaber", bank_account_holder])
                if bank_name:
                    bank_rows.append(["Bank", bank_name])
                if bank_iban:
                    bank_rows.append(["IBAN", _fmt_iban(bank_iban)])
                if bank_bic:
                    bank_rows.append(["BIC", bank_bic])

                bank_data = [
                    [Paragraph(k, info_key_sty), Paragraph(v, info_val_sty)]
                    for k, v in bank_rows
                ]
                bank_tbl = Table(bank_data, colWidths=[3.5*cm, 9*cm])
                bank_tbl.setStyle(TableStyle([
                    ("BACKGROUND",    (0,0), (-1,-1), hex_color("#f0f7ff")),
                    ("GRID",          (0,0), (-1,-1), 0.25, hex_color("#bfdbfe")),
                    ("TOPPADDING",    (0,0), (-1,-1), 5),
                    ("BOTTOMPADDING", (0,0), (-1,-1), 5),
                    ("LEFTPADDING",   (0,0), (-1,-1), 10),
                    ("RIGHTPADDING",  (0,0), (-1,-1), 10),
                    ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
                ]))
                story.append(bank_tbl)
                story.append(Spacer(1, 4*mm))

                # Suggested payment reference
                ref = f"NK {year} Whg. {apt_code} {tenant_name}"
                story.append(Paragraph(
                    f"Verwendungszweck: <b>{ref}</b>",
                    sty("Ref", fontSize=8.5, leading=12,
                        textColor=hex_color(COL_GRAY), spaceAfter=4)))

        # ── ⑥ Footer ─────────────────────────────────────────
        story.append(Spacer(1, 4*mm))
        story.append(HRFlowable(width="100%", thickness=0.5,
                                color=hex_color("#e2e8f0"), spaceAfter=4))
        story.append(Paragraph(
            f"Erstellt am {datetime.now().strftime('%d.%m.%Y')}  ·  "
            f"Nebenkosten-Portal  ·  Abrechnungsjahr {year}",
            small_c_sty))

        doc.build(story)
        logger.info(f"PDF generated: {output_path}")
        return True

    except Exception as e:
        logger.error(f"PDF generation failed: {e}", exc_info=True)
        return False
