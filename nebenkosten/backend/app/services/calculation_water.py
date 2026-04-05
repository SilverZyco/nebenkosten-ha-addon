"""Water cost calculation for annual billing."""
from __future__ import annotations
from decimal import Decimal
from typing import Dict, List

from .calculation_utils import _round2, THREE_DECIMALS


class WaterCalculation:
    """
    Calculates water costs per apartment.

    Rules:
    - apt_m3 = water_apartment_m3 + washer_m3 (if present)
    - sub_sum = sum of all apt_m3
    - factor = main_m3 / sub_sum  (correction for losses/rounding)
    - apt_m3_adjusted = apt_m3 * factor
    - price_per_m3 = total_cost / main_m3
    - cost_apt = apt_m3_adjusted * price_per_m3

    At tenant change: if intermediate reading exists => use exact m3.
    Otherwise fallback: allocate proportionally by days.
    """

    def __init__(
        self,
        total_cost: Decimal,
        main_m3: Decimal,
        factor_min: float = 0.90,
        factor_max: float = 1.10,
    ):
        self.total_cost = total_cost
        self.main_m3 = main_m3
        self.factor_min = Decimal(str(factor_min))
        self.factor_max = Decimal(str(factor_max))
        self.warnings: List[str] = []

    def calculate(self, apartment_readings: Dict[str, Dict]) -> Dict[str, Dict]:
        """
        apartment_readings: {
          apt_code: {
            "apartment_m3": Decimal,       # consumption this year
            "washer_m3": Decimal or None,  # consumption this year
            "has_washer": bool,
          }
        }
        Returns per-apartment cost dict.
        """
        # Step 1: Sum up sub-meters (respects meter replacement segments)
        apt_totals: Dict[str, Decimal] = {}
        for code, r in apartment_readings.items():
            apt = r["apartment_m3"]
            if apt < 0:
                self.warnings.append(f"Wasser: Rückläufiger Zähler bei {code}")
                apt = Decimal("0")
            washer = r.get("washer_m3") or Decimal("0")
            if r.get("has_washer") and washer < 0:
                self.warnings.append(f"Waschmaschine: Rückläufiger Zähler bei {code}")
                washer = Decimal("0")
            washer_total = washer if r.get("has_washer") else Decimal("0")
            apt_totals[code] = apt + washer_total
            if r.get("replacement_note"):
                self.warnings.append(r["replacement_note"])

        sub_sum = sum(apt_totals.values(), Decimal("0"))

        if sub_sum == 0:
            self.warnings.append("Wasser: Summe Sub-Zähler ist 0, keine Kostenverteilung möglich")
            return {code: {"cost": Decimal("0"), "m3": Decimal("0"), "factor": Decimal("1")} for code in apartment_readings}

        # Step 2: Correction factor (main_m3=None means no main meter → factor=1.0)
        if self.main_m3 is None:
            factor = Decimal("1")
            effective_main_m3 = sub_sum
        else:
            effective_main_m3 = self.main_m3
            factor = effective_main_m3 / sub_sum if sub_sum > 0 else Decimal("1")
            if factor < self.factor_min or factor > self.factor_max:
                self.warnings.append(
                    f"Wasser: Korrekturfaktor {factor:.4f} außerhalb Toleranzband "
                    f"[{self.factor_min}..{self.factor_max}]. Bitte Zählerstände prüfen!"
                )

        # Step 3: Adjusted consumption and costs
        price_per_m3 = self.total_cost / effective_main_m3 if effective_main_m3 > 0 else Decimal("0")

        results: Dict[str, Dict] = {}
        total_allocated = Decimal("0")
        codes = list(apt_totals.keys())

        for i, code in enumerate(codes):
            m3_adj = apt_totals[code] * factor
            cost = _round2(m3_adj * price_per_m3)
            if i == len(codes) - 1:
                # Last apartment gets residual to avoid rounding drift
                cost = _round2(self.total_cost - total_allocated)
            else:
                total_allocated += cost

            results[code] = {
                "raw_m3": apt_totals[code],
                "m3_adjusted": _round2(m3_adj),
                "factor": factor.quantize(Decimal("0.0001")),
                "price_per_m3": _round2(price_per_m3),
                "cost": cost,
            }

        return results
