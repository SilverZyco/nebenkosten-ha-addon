"""Helper to add logo to PDF documents."""
import os
from typing import Optional
from reportlab.platypus import Image
from reportlab.lib.units import cm


def get_logo_image(width: float = 3.5 * cm, height: float = 1.2 * cm) -> Optional[Image]:
    """Return a ReportLab Image for the logo, or None if not found."""
    logo_path = os.environ.get("LOGO_PATH", "/app/logo/logo.png")
    if not os.path.isfile(logo_path):
        return None
    try:
        img = Image(logo_path, width=width, height=height)
        img.hAlign = "RIGHT"
        return img
    except Exception:
        return None
