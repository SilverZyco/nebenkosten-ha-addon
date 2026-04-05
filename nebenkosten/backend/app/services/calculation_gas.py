"""Gas/heat cost calculation using Zenner meters."""
from __future__ import annotations
from decimal import Decimal
from typing import Dict, List

from .calculation_utils import _round2, THREE_DECIMALS


class GasHeatCalculation:
    """
    Calculates gas/heating costs per apartment using Zenner meters.

    Rules:
    - kWh_i = (MWh_end - MWh_start) * 1000
    - zenner_sum = sum(kWh_i)
    - factor = bill_total_kwh / zenner_sum
    - kWh_i_adjusted = kWh_i * factor
    - cost_i = total_gas_cost * (kWh_i_adjusted / bill_total_kwh)
    """

    def __init__(
        self,
        total_cost: Decimal,
        bill_total_kwh: Decimal,
        factor_min: float = 0.90,
        factor_max: float = 1.10,
    ):
        self.total_cost = total_cost
        self.bill_total_kwh = bill_total_kwh
        self.factor_min = Decimal(str(factor_min))
        self.factor_max = Decimal(str(factor_max))
        self.warnings: List[str] = []

    def calculate(self, zenner_readings: Dict[str, Dict]) -> Dict[str, Dict]:
        """
        zenner_readings: {
          apt_code: {
            "mwh_start": Decimal,
            "mwh_end": Decimal,
          }
        }
        """
        kwh_per_apt: Dict[str, Decimal] = {}
        for code, r in zenner_readings.items():
            mwh_start = r["mwh_start"]
            mwh_end = r["mwh_end"]
            if mwh_end < mwh_start:
                self.warnings.append(f"Gas/Zenner: Rückläufiger Zähler bei {code}")
                mwh_end = mwh_start
            kwh = (mwh_end - mwh_start) * Decimal("1000")
            kwh_per_apt[code] = kwh

        zenner_sum = sum(kwh_per_apt.values(), Decimal("0"))

        if zenner_sum == 0:
            self.warnings.append("Gas: Zenner-Summe ist 0, keine Kostenverteilung möglich")
            return {code: {"cost": Decimal("0"), "kwh": Decimal("0"), "factor": Decimal("1")} for code in zenner_readings}

        factor = self.bill_total_kwh / zenner_sum
        if factor < self.factor_min or factor > self.factor_max:
            self.warnings.append(
                f"Gas: Korrekturfaktor {factor:.4f} außerhalb Toleranzband "
                f"[{self.factor_min}..{self.factor_max}]. Bitte Zählerstände prüfen!"
            )

        results: Dict[str, Dict] = {}
        total_allocated = Decimal("0")
        codes = list(kwh_per_apt.keys())

        for i, code in enumerate(codes):
            kwh_adj = kwh_per_apt[code] * factor
            cost = _round2(self.total_cost * kwh_adj / self.bill_total_kwh)
            if i == len(codes) - 1:
                cost = _round2(self.total_cost - total_allocated)
            else:
                total_allocated += cost

            results[code] = {
                "kwh_raw": kwh_per_apt[code].quantize(THREE_DECIMALS),
                "kwh_adjusted": kwh_adj.quantize(THREE_DECIMALS),
                "factor": factor.quantize(Decimal("0.0001")),
                "cost": cost,
            }

        return results
