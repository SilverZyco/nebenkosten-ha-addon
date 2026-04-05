"""OCR service using Tesseract + pdf2image."""
import os
import logging
from typing import Optional
from pathlib import Path

logger = logging.getLogger(__name__)


async def extract_text_from_pdf(file_path: str) -> Optional[str]:
    """Extract text from PDF using OCR (Tesseract via pdf2image)."""
    try:
        from pdf2image import convert_from_path
        import pytesseract
        from PIL import Image

        images = convert_from_path(file_path, dpi=300)
        text_parts = []

        for i, image in enumerate(images):
            # Try German + English
            text = pytesseract.image_to_string(image, lang="deu+eng", config="--oem 3 --psm 3")
            text_parts.append(f"=== Seite {i + 1} ===\n{text}")

        full_text = "\n\n".join(text_parts)
        logger.info(f"OCR extracted {len(full_text)} chars from {file_path}")
        return full_text

    except ImportError:
        logger.warning("pdf2image or pytesseract not available")
        return None
    except Exception as e:
        logger.error(f"OCR failed for {file_path}: {e}")
        return None


async def extract_text_from_image(file_path: str) -> Optional[str]:
    """Extract text from image file."""
    try:
        import pytesseract
        from PIL import Image

        img = Image.open(file_path)
        text = pytesseract.image_to_string(img, lang="deu+eng")
        return text
    except Exception as e:
        logger.error(f"Image OCR failed: {e}")
        return None
