"""Waste (EVS) cost calculation via bin_id mapping."""
from __future__ import annotations
from decimal import Decimal
from typing import Dict, List

from .calculation_utils import _round2


class WasteCostCalculation:
    """
    Allocates waste (EVS) costs to apartments via bin_id mapping.

    EVS invoice contains multiple lines per bin_id:
    - base_fee per bin
    - emptying counts + prices
    - extra emptying

    Mapping: bin_id -> apartment_code
    Unmatched bin_ids go to "__unassigned__" for admin review.
    """

    def calculate(
        self,
        invoice_lines: List[Dict],
        bin_mappings: Dict[str, List[str]],  # bin_id -> list of apt_codes (shared bins allowed)
        year: int,
        occupancy: Dict[str, Dict],
        warnings: List[str],
    ) -> Dict[str, Dict]:
        """
        invoice_lines: list of {
            "bin_id": str,
            "description": str,
            "amount": Decimal,
            "period_from": date or None,
            "period_to": date or None,
        }
        Returns {apt_code: {"cost": Decimal, "lines": [...]}}
        """
        results: Dict[str, Dict] = {
            code: {"cost": Decimal("0"), "lines": []}
            for code in occupancy
        }
        unassigned: List[Dict] = []

        for line in invoice_lines:
            bin_id = str(line.get("bin_id", "")).strip()
            apt_codes = bin_mappings.get(bin_id) or []

            if not apt_codes:
                warnings.append(f"Müll: Tonnen-Nr {bin_id!r} keiner Wohnung zugeordnet! Bitte in Wohnungs-Einstellungen prüfen.")
                unassigned.append(line)
                continue

            amount = Decimal(str(line.get("amount", "0")))
            n = len(apt_codes)
            share = _round2(amount / n)

            for i, apt_code in enumerate(apt_codes):
                if apt_code not in results:
                    results[apt_code] = {"cost": Decimal("0"), "lines": []}

                # Last share gets any rounding remainder
                this_share = _round2(amount - share * (n - 1)) if i == n - 1 else share

                desc = line.get("description", "")
                if n > 1:
                    desc = f"{desc} (1/{n} Anteil)"

                results[apt_code]["cost"] += this_share
                results[apt_code]["lines"].append({
                    "description": desc,
                    "amount": str(this_share),
                    "bin_id": bin_id,
                    "bin_size": line.get("bin_size", ""),
                    "std_count": line.get("std_count", 0),
                    "extra_count": line.get("extra_count", 0),
                    "total_emptyings": line.get("total_emptyings", 0),
                    "emptyings": line.get("emptyings", []),
                    "extra_emptyings": line.get("extra_emptyings", []),
                    "base_fee": line.get("base_fee"),
                    "share_n": n,
                })

        if unassigned:
            results["__unassigned__"] = {
                "cost": sum(Decimal(str(l.get("amount", "0"))) for l in unassigned),
                "lines": unassigned,
            }

        return results
