"""Shared utilities for PDF generation (colours, formatters, helpers)."""
from __future__ import annotations
import base64
import io
from decimal import Decimal

try:
    from PIL import Image as PilImage
    _PIL_AVAILABLE = True
except ImportError:
    _PIL_AVAILABLE = False

# ---------------------------------------------------------------------------
# Brand colours
# ---------------------------------------------------------------------------
COL_DARK  = "#1a3a5c"   # deep navy – headings / table header
COL_MID   = "#2563a8"   # medium blue – accent line
COL_LIGHT = "#dbeafe"   # pale blue – alternating row
COL_GREEN = "#16a34a"
COL_RED   = "#dc2626"
COL_GRAY  = "#6b7280"
COL_LGRAY = "#f3f4f6"

# ---------------------------------------------------------------------------
# Formatters
# ---------------------------------------------------------------------------

def _fmt_eur(value) -> str:
    """Format a numeric value as German currency string, e.g. 1.234,56 €"""
    try:
        return f"{Decimal(str(value)):,.2f} \u20ac".replace(",", "X").replace(".", ",").replace("X", ".")
    except Exception:
        return "0,00 \u20ac"


def _fmt_date(d) -> str:
    """Format ISO date string or date object as DD.MM.YYYY."""
    if not d:
        return "–"
    try:
        if isinstance(d, str):
            from datetime import date as _date
            parsed = _date.fromisoformat(d)
        else:
            parsed = d
        return parsed.strftime("%d.%m.%Y")
    except Exception:
        return str(d)


def _fmt_iban(iban: str) -> str:
    """Format IBAN with spaces every 4 chars, e.g. DE12 3456 7890"""
    clean = iban.replace(" ", "")
    return " ".join(clean[i:i+4] for i in range(0, len(clean), 4))


# ---------------------------------------------------------------------------
# Signature helper
# ---------------------------------------------------------------------------

def _sig_to_white_bg(b64: str) -> io.BytesIO:
    """Convert transparent-background signature PNG to white-background PNG."""
    data = b64
    if "," in data:
        data = data.split(",", 1)[1]
    raw = base64.b64decode(data)
    if _PIL_AVAILABLE:
        img = PilImage.open(io.BytesIO(raw)).convert("RGBA")
        bg = PilImage.new("RGBA", img.size, (255, 255, 255, 255))
        bg.paste(img, mask=img.split()[3])
        out = io.BytesIO()
        bg.convert("RGB").save(out, format="PNG")
        out.seek(0)
        return out
    return io.BytesIO(raw)
