"""Fixed cost allocation (pro-rata by days) for annual billing."""
from __future__ import annotations
from decimal import Decimal
from datetime import date
from typing import Dict

from .calculation_utils import _round2, days_in_year, days_in_period, prorate


class FixedCostAllocation:
    """
    Allocates fixed costs pro-rata by days occupied per apartment.

    Supported cost types:
    - rainwater: 1/4 each (all 4 apts)
    - electricity_common: 1/4 each
    - property_tax: DU=2, others=1 => 5 total shares
    - insurance: EG/OG/DG only => 1/3 each
    - maintenance / chimney_sweep / heating_other: EG/OG/DG only => 1/3 each
    """

    SCHEMES = {
        "rainwater": {
            "shares": {"EG": 1, "OG": 1, "DG": 1, "DU": 1},
            "total_shares": 4,
        },
        "electricity_common": {
            "shares": {"EG": 1, "OG": 1, "DG": 1, "DU": 1},
            "total_shares": 4,
        },
        "property_tax": {
            "shares": {"EG": 1, "OG": 1, "DG": 1, "DU": 2},
            "total_shares": 5,
        },
        "insurance": {
            "shares": {"EG": 1, "OG": 1, "DG": 1, "DU": 0},
            "total_shares": 3,
        },
        "maintenance": {
            "shares": {"EG": 1, "OG": 1, "DG": 1, "DU": 0},
            "total_shares": 3,
        },
        "chimney_sweep": {
            "shares": {"EG": 1, "OG": 1, "DG": 1, "DU": 0},
            "total_shares": 3,
        },
        "heating_other": {
            "shares": {"EG": 1, "OG": 1, "DG": 1, "DU": 0},
            "total_shares": 3,
        },
    }

    def allocate(
        self,
        cost_type: str,
        total_cost: Decimal,
        occupancy: Dict[str, Dict],
        year: int,
    ) -> Dict[str, Decimal]:
        """
        occupancy: {
          apt_code: {
            "tenancy_start": date,
            "tenancy_end": date,  # inclusive, or Dec 31 if active
          }
        }
        Returns {apt_code: cost}
        """
        scheme = self.SCHEMES.get(cost_type)
        if not scheme:
            raise ValueError(f"Unbekannter Kostentyp: {cost_type}")

        shares = scheme["shares"]
        total_shares = scheme["total_shares"]
        total_days = days_in_year(year)

        results: Dict[str, Decimal] = {}
        total_allocated = Decimal("0")
        eligible = [c for c in occupancy if shares.get(c, 0) > 0]

        for i, code in enumerate(eligible):
            share = shares.get(code, 0)
            if share == 0:
                results[code] = Decimal("0.00")
                continue

            occ = occupancy[code]
            start = occ["tenancy_start"]
            end = occ["tenancy_end"]
            occupied_days = days_in_period(start, end, year)

            cost = prorate(total_cost, occupied_days, total_days, share, total_shares)

            if i == len(eligible) - 1:
                # Actually just do residual for full-year tenants
                cost = _round2(total_cost * Decimal(share) / Decimal(total_shares) * Decimal(occupied_days) / Decimal(total_days))
            total_allocated += cost
            results[code] = cost

        # For non-eligible (DU in insurance etc.)
        for code in occupancy:
            if code not in results:
                results[code] = Decimal("0.00")

        return results
