"""Extract plain text from ODT files."""
import zipfile
import re
from xml.etree import ElementTree as ET


def extract_odt_text(filepath: str) -> str:
    """Read an ODT file and return its plain text content."""
    try:
        with zipfile.ZipFile(filepath, "r") as z:
            with z.open("content.xml") as f:
                xml = f.read().decode("utf-8")

        # Strip all XML tags, preserve newlines for paragraphs/line-breaks
        # Replace paragraph and line-break tags with newlines first
        xml = re.sub(r"<text:p[^/]*/?>", "\n", xml)
        xml = re.sub(r"</text:p>", "\n", xml)
        xml = re.sub(r"<text:line-break\s*/>", "\n", xml)
        xml = re.sub(r"<text:tab\s*/>", "    ", xml)

        # Remove all remaining tags
        xml = re.sub(r"<[^>]+>", "", xml)

        # Decode XML entities
        xml = xml.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">") \
                  .replace("&quot;", '"').replace("&apos;", "'").replace("&#xA;", "\n")

        # Collapse multiple blank lines to max 2
        lines = xml.split("\n")
        result = []
        blank_count = 0
        for line in lines:
            stripped = line.rstrip()
            if stripped == "":
                blank_count += 1
                if blank_count <= 1:
                    result.append("")
            else:
                blank_count = 0
                result.append(stripped)

        return "\n".join(result).strip()

    except Exception as e:
        print(f"[odt_reader] Error reading {filepath}: {e}")
        return ""
