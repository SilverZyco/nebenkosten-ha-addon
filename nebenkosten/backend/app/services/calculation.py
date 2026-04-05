"""
Deterministic billing calculation engine for Nebenkosten.

All calculations follow the rules specified in requirements:
- Water: main meter correction factor, sub-meter sum
- Gas/Heat: Zenner MWh -> kWh, correction factor from bill
- Fixed costs: pro-rata by days occupied
- Waste: per bin_id mapping
- Property tax: DU=2 shares, others=1
- Insurance/Heating: only EG/OG/DG (not DU)
"""
from __future__ import annotations
from decimal import Decimal
from datetime import date
from typing import Any, Dict, List, Optional, Tuple
import logging

from .calculation_utils import _round2, days_in_year, days_in_period, prorate, prorate_by_period
from .calculation_water import WaterCalculation
from .calculation_gas import GasHeatCalculation
from .calculation_fixed import FixedCostAllocation
from .calculation_waste import WasteCostCalculation

logger = logging.getLogger(__name__)


class BillingCalculator:
    """
    Orchestrates complete annual billing calculation.
    """

    def __init__(self, factor_min: float = 0.90, factor_max: float = 1.10):
        self.factor_min = factor_min
        self.factor_max = factor_max
        self.warnings: List[str] = []

    def calculate(
        self,
        year: int,
        apartments: List[Dict],
        tenancies: List[Dict],
        documents: List[Dict],
        meter_readings: List[Dict],
        bin_mappings: Dict[str, str],
    ) -> Dict[str, Any]:
        """
        Main entry point. Returns full calculation result.

        apartments: [{id, code, has_washer_meter, has_zenner_meter, is_owner_occupied, heating_share_factor, tax_share_factor, area_sqm}]
        tenancies: [{id, apartment_id, tenant_id, start_date, end_date, monthly_advance_payment}]
        documents: [{id, document_type, total_amount, bill_total_kwh, is_billable, service_period_from, service_period_to, ai_json, status}]
        meter_readings: [{id, apartment_id, meter_type, reading_date, value, year, is_start_of_year, is_end_of_year, is_intermediate}]
        bin_mappings: {bin_id: apt_code}
        """
        self.warnings = []
        apt_by_code = {a["code"]: a for a in apartments}
        apt_by_id = {a["id"]: a for a in apartments}

        # 1. Build occupancy map (primary tenant – for fixed cost allocation)
        occupancy = self._build_occupancy(apt_by_code, tenancies, year)

        # 2. Build full tenancy list (all tenants per apartment in year)
        all_tenancies = self._get_all_tenancies(apt_by_code, tenancies, year)

        # 3. Advance payments – per apartment (legacy) + per tenancy (split)
        advance_payments = self._calc_advance_payments(tenancies, year, apt_by_id)
        advance_by_tenancy = self._calc_advance_by_tenancy(tenancies, year, apt_by_id)

        # 4. Extract meter readings for year
        readings = self._extract_readings(meter_readings, year, apt_by_id)

        # 5. Compute split fractions for multi-tenant apartments
        split_fractions = self._compute_split_fractions(all_tenancies, readings, year)

        # 6. Calculate water costs
        water_result = self._calc_water(documents, readings, apt_by_code, year)

        # 7. Calculate gas/heat costs
        gas_result = self._calc_gas(documents, readings, apt_by_code, year)

        # 8. Allocate fixed costs (at apartment level – split later in aggregate)
        fixed_result = self._calc_fixed_costs(documents, occupancy, year)

        # 9. Waste costs
        waste_result = self._calc_waste(documents, bin_mappings, occupancy, year)

        # 10. Aggregate per tenant (returns a list, multi-tenant supported)
        per_apt_list = self._aggregate(
            apartments, occupancy, advance_payments,
            water_result, gas_result, fixed_result, waste_result, year,
            all_tenancies=all_tenancies,
            advance_by_tenancy=advance_by_tenancy,
            split_fractions=split_fractions,
        )

        return {
            "year": year,
            "per_apartment": per_apt_list,
            "water_calculation": water_result,
            "gas_calculation": gas_result,
            "fixed_costs": fixed_result,
            "waste_calculation": waste_result,
            "warnings": self.warnings,
        }

    def _build_occupancy(self, apt_by_code: Dict, tenancies: List[Dict], year: int) -> Dict:
        year_start = date(year, 1, 1)
        year_end = date(year, 12, 31)
        occupancy = {}

        for code, apt in apt_by_code.items():
            apt_tenancies = [
                t for t in tenancies
                if apt_by_code.get(code, {}).get("id") == t.get("apartment_id") or
                   apt.get("id") == t.get("apartment_id")
            ]
            active = []
            for t in apt_tenancies:
                t_start = t["start_date"] if isinstance(t["start_date"], date) else date.fromisoformat(str(t["start_date"]))
                t_end = t["end_date"] if t["end_date"] else year_end
                if isinstance(t_end, str):
                    t_end = date.fromisoformat(t_end)
                if t_start <= year_end and t_end >= year_start:
                    active.append({
                        "tenancy_id": t["id"],
                        "tenant_id": t["tenant_id"],
                        "start_date": t_start,
                        "end_date": t_end,
                        "advance": Decimal(str(t.get("monthly_advance_payment", "0"))),
                    })

            if not active:
                occupancy[code] = {
                    "tenancy_start": year_start,
                    "tenancy_end": year_end,
                    "tenancy_id": None,
                    "tenant_id": apt.get("owner_user_id"),
                    "tenancies": [],
                    "fully_occupied": True,
                }
            else:
                primary = max(active, key=lambda x: days_in_period(x["start_date"], x["end_date"], year))
                occupancy[code] = {
                    "tenancy_start": max(primary["start_date"], year_start),
                    "tenancy_end": min(primary["end_date"], year_end),
                    "tenancy_id": primary["tenancy_id"],
                    "tenant_id": primary["tenant_id"],
                    "tenancies": active,
                    "fully_occupied": len(active) == 1 and primary["start_date"] <= year_start and primary["end_date"] >= year_end,
                }

        return occupancy

    def _calc_advance_payments(self, tenancies: List[Dict], year: int, apt_by_id: Dict) -> Dict[str, Decimal]:
        year_start = date(year, 1, 1)
        year_end = date(year, 12, 31)
        result: Dict[str, Decimal] = {}

        for t in tenancies:
            apt = apt_by_id.get(t["apartment_id"])
            if not apt:
                continue
            code = apt["code"]
            t_start = t["start_date"] if isinstance(t["start_date"], date) else date.fromisoformat(str(t["start_date"]))
            t_end = t["end_date"] if t["end_date"] else year_end
            if isinstance(t_end, str):
                t_end = date.fromisoformat(t_end)

            months = 0
            d = max(t_start, year_start)
            while d <= min(t_end, year_end):
                months += 1
                if d.month == 12:
                    d = date(d.year + 1, 1, 1)
                else:
                    d = date(d.year, d.month + 1, 1)
                if d > min(t_end, year_end):
                    break

            monthly = Decimal(str(t.get("monthly_advance_payment", "0")))
            advance = monthly * months

            if code not in result:
                result[code] = Decimal("0")
            result[code] += advance

        return result

    def _get_all_tenancies(self, apt_by_code: Dict, tenancies: List[Dict], year: int) -> Dict[str, List[Dict]]:
        """Returns {apt_code: [sorted list of all tenancies active in year, clamped to year bounds]}."""
        year_start = date(year, 1, 1)
        year_end = date(year, 12, 31)
        result: Dict[str, List[Dict]] = {}

        for code, apt in apt_by_code.items():
            apt_tenancies = [t for t in tenancies if apt.get("id") == t.get("apartment_id")]
            active = []
            for t in apt_tenancies:
                t_start = t["start_date"] if isinstance(t["start_date"], date) else date.fromisoformat(str(t["start_date"]))
                t_end = t["end_date"] if t["end_date"] else year_end
                if isinstance(t_end, str):
                    t_end = date.fromisoformat(t_end)
                if t_start <= year_end and t_end >= year_start:
                    active.append({
                        "tenancy_id": t["id"],
                        "tenant_id": t["tenant_id"],
                        "start_date": max(t_start, year_start),
                        "end_date": min(t_end, year_end),
                        "advance": Decimal(str(t.get("monthly_advance_payment", "0"))),
                    })
            active.sort(key=lambda x: x["start_date"])
            result[code] = active

        return result

    def _calc_advance_by_tenancy(self, tenancies: List[Dict], year: int, apt_by_id: Dict) -> Dict[str, Decimal]:
        """Returns {tenancy_id: total_advance_paid_within_year}."""
        year_start = date(year, 1, 1)
        year_end = date(year, 12, 31)
        result: Dict[str, Decimal] = {}

        for t in tenancies:
            t_start = t["start_date"] if isinstance(t["start_date"], date) else date.fromisoformat(str(t["start_date"]))
            t_end = t["end_date"] if t["end_date"] else year_end
            if isinstance(t_end, str):
                t_end = date.fromisoformat(t_end)

            months = 0
            d = max(t_start, year_start)
            while d <= min(t_end, year_end):
                months += 1
                if d.month == 12:
                    d = date(d.year + 1, 1, 1)
                else:
                    d = date(d.year, d.month + 1, 1)
                if d > min(t_end, year_end):
                    break

            monthly = Decimal(str(t.get("monthly_advance_payment", "0")))
            result[t["id"]] = monthly * months

        return result

    def _compute_split_fractions(
        self,
        all_tenancies: Dict[str, List[Dict]],
        readings: Dict,
        year: int,
    ) -> Dict[str, Tuple[Decimal, ...]]:
        """
        For apartments with 2+ tenants compute consumption fractions.
        Prefers water intermediate reading; falls back to pro-rata by days.
        Returns {apt_code: (frac_tenant1, frac_tenant2, ...)}.
        """
        result: Dict[str, Tuple[Decimal, ...]] = {}

        for code, ten_list in all_tenancies.items():
            n = len(ten_list)
            if n < 2:
                continue

            if n == 2:
                t1, t2 = ten_list
                wa = readings.get("water_apartment", {}).get(code, {})
                w_start = wa.get("start")
                w_end = wa.get("end")
                w_mid = wa.get("intermediate")

                if w_start is not None and w_end is not None and w_mid is not None:
                    total_m3 = w_end - w_start
                    if total_m3 > 0:
                        frac1 = (w_mid - w_start) / total_m3
                        frac1 = max(Decimal("0"), min(Decimal("1"), frac1))
                        frac2 = Decimal("1") - frac1
                        result[code] = (frac1, frac2)
                        continue

                days1 = days_in_period(t1["start_date"], t1["end_date"], year)
                days2 = days_in_period(t2["start_date"], t2["end_date"], year)
                total = days1 + days2
                if total > 0:
                    frac1 = Decimal(str(days1)) / Decimal(str(total))
                    result[code] = (frac1, Decimal("1") - frac1)
                else:
                    result[code] = (Decimal("0.5"), Decimal("0.5"))
            else:
                all_days = [days_in_period(t["start_date"], t["end_date"], year) for t in ten_list]
                total = sum(all_days)
                if total > 0:
                    fracs = tuple(Decimal(str(d)) / Decimal(str(total)) for d in all_days)
                else:
                    fracs = tuple(Decimal("1") / Decimal(str(n)) for _ in range(n))
                result[code] = fracs

        return result

    def _extract_readings(self, meter_readings: List[Dict], year: int, apt_by_id: Dict) -> Dict:
        readings = {
            "water_main": {},
            "water_apartment": {},
            "water_washer": {},
            "zenner_heat": {},
            "gas_main": {},
        }

        for r in meter_readings:
            if r.get("year") != year and not (
                r.get("is_start_of_year") or r.get("is_end_of_year") or r.get("is_intermediate")
            ):
                continue

            mt = r["meter_type"]
            apt_id = r.get("apartment_id")
            value = Decimal(str(r["value"]))

            if mt == "water_main":
                rdate = r["reading_date"] if isinstance(r["reading_date"], date) else date.fromisoformat(str(r["reading_date"]))
                if r.get("is_start_of_year"):
                    readings["water_main"]["start"] = value
                    readings["water_main"]["start_date"] = rdate
                elif r.get("is_end_of_year"):
                    readings["water_main"]["end"] = value
                    readings["water_main"]["end_date"] = rdate

            elif mt == "gas_main":
                if r.get("is_start_of_year"):
                    readings["gas_main"]["start"] = value
                elif r.get("is_end_of_year"):
                    readings["gas_main"]["end"] = value

            elif mt in ("water_apartment", "water_washer", "zenner_heat"):
                apt = apt_by_id.get(apt_id)
                if not apt:
                    continue
                code = apt["code"]
                key = mt
                if code not in readings[key]:
                    readings[key][code] = {}
                if r.get("is_replacement_start"):
                    readings[key][code]["replacement_start"] = value
                    readings[key][code]["has_replacement"] = True
                elif r.get("is_start_of_year"):
                    readings[key][code]["start"] = value
                elif r.get("is_end_of_year"):
                    readings[key][code]["end"] = value
                elif r.get("is_intermediate"):
                    readings[key][code]["old_meter_end"] = value
                    readings[key][code]["intermediate"] = value
                    rdate = r["reading_date"] if isinstance(r["reading_date"], date) else date.fromisoformat(str(r["reading_date"]))
                    readings[key][code]["intermediate_date"] = rdate

        return readings

    def _calc_water(self, documents: List[Dict], readings: Dict, apt_by_code: Dict, year: int) -> Dict:
        water_docs = [
            d for d in documents
            if d["document_type"] == "water_invoice"
            and d.get("is_billable")
            and d.get("total_amount")
            and (d.get("status") in ("confirmed", None) or d.get("is_billable"))
        ]

        if not water_docs:
            self.warnings.append("Wasser: Keine umlagefähige Wasserrechnung für dieses Jahr gefunden.")
            return {"total_cost": Decimal("0"), "per_apartment": {}}

        total_cost_gross = sum(Decimal(str(d["total_amount"])) for d in water_docs)

        embedded_rainwater = sum(
            Decimal(str(d["rainwater_amount"])) for d in water_docs if d.get("rainwater_amount")
        )
        total_cost = total_cost_gross - embedded_rainwater

        if embedded_rainwater > 0:
            logger.info(
                f"Wasser: Niederschlagswasser {embedded_rainwater}€ aus Wasserrechnung herausgerechnet "
                f"(Gesamtrechnung {total_cost_gross}€ → Trinkwasser/Abwasser {total_cost}€)"
            )

        wm = readings.get("water_main", {})
        main_start = wm.get("start")
        main_end = wm.get("end")

        if main_start is None or main_end is None:
            self.warnings.append(
                "Wasser: Hauptwasserzähler fehlt – Korrekturfaktor wird auf 1.0 gesetzt "
                "(Verteilung nur nach Wohnungszählern)."
            )
            main_m3 = None
        else:
            main_m3 = main_end - main_start
            if main_m3 < 0:
                self.warnings.append("Wasser: Hauptzähler rückläufig! Bitte prüfen.")
                main_m3 = Decimal("0")

        apt_readings = {}
        for code, apt in apt_by_code.items():
            wa = readings["water_apartment"].get(code, {})
            w_start = wa.get("start")
            w_end = wa.get("end")
            w_repl_start = wa.get("replacement_start")

            if w_start is None or w_end is None:
                self.warnings.append(f"Wasser: Zählerstand {code} (Start/End) fehlt für {year}.")
                apt_readings[code] = {
                    "apartment_m3": Decimal("0"),
                    "washer_m3": Decimal("0"),
                    "has_washer": apt.get("has_washer_meter", False),
                }
                continue

            if w_repl_start is not None:
                apt_m3 = (w_end - w_repl_start)
                w_old_end = wa.get("old_meter_end")
                if w_old_end is not None:
                    apt_m3 += (w_old_end - w_start)
                note = f"Wasser: Zählertausch {code} – Segment1 + Segment2 addiert."
            else:
                apt_m3 = w_end - w_start
                note = None

            washer_m3 = Decimal("0")
            if apt.get("has_washer_meter"):
                wr = readings["water_washer"].get(code, {})
                ws_start = wr.get("start")
                ws_end = wr.get("end")
                ws_repl = wr.get("replacement_start")
                if ws_start is not None and ws_end is not None:
                    if ws_repl is not None:
                        washer_m3 = (ws_end - ws_repl)
                        ws_old_end = wr.get("old_meter_end")
                        if ws_old_end is not None:
                            washer_m3 += (ws_old_end - ws_start)
                    else:
                        washer_m3 = ws_end - ws_start
                else:
                    self.warnings.append(f"Wasser: Waschmaschinenzähler {code} fehlt für {year}.")

            apt_readings[code] = {
                "apartment_m3": apt_m3,
                "washer_m3": washer_m3,
                "has_washer": apt.get("has_washer_meter", False),
                "replacement_note": note,
            }

        calc = WaterCalculation(total_cost, main_m3, self.factor_min, self.factor_max)
        per_apt = calc.calculate(apt_readings)
        self.warnings.extend(calc.warnings)

        result = {
            "total_cost": total_cost,
            "main_m3": main_m3,
            "per_apartment": per_apt,
        }
        if embedded_rainwater > 0:
            result["rainwater_deducted"] = embedded_rainwater
            result["total_cost_gross"] = total_cost_gross
        return result

    def _calc_gas(self, documents: List[Dict], readings: Dict, apt_by_code: Dict, year: int) -> Dict:
        gas_docs = [
            d for d in documents
            if d["document_type"] == "gas_invoice"
            and d.get("is_billable")
            and d.get("total_amount")
        ]

        if not gas_docs:
            self.warnings.append("Gas: Keine umlagefähige Gasrechnung für dieses Jahr gefunden.")
            return {"total_cost": Decimal("0"), "per_apartment": {}}

        # Prorate each invoice by its overlap with the billing year
        total_cost = Decimal("0")
        bill_total_kwh = Decimal("0")
        for d in gas_docs:
            period_from = d.get("service_period_from")
            period_to = d.get("service_period_to")
            amount = Decimal(str(d["total_amount"]))
            kwh = Decimal(str(d["bill_total_kwh"])) if d.get("bill_total_kwh") else None

            if period_from and period_to:
                if isinstance(period_from, str):
                    period_from = date.fromisoformat(period_from)
                if isinstance(period_to, str):
                    period_to = date.fromisoformat(period_to)
                amount = prorate_by_period(amount, period_from, period_to, year)
                if kwh:
                    kwh = prorate_by_period(kwh, period_from, period_to, year)
                if amount == 0:
                    continue  # No overlap with billing year

            total_cost += amount
            if kwh:
                bill_total_kwh += kwh

        if total_cost == 0:
            self.warnings.append("Gas: Keine Gasrechnung mit Überschneidung zum Abrechnungsjahr gefunden.")
            return {"total_cost": Decimal("0"), "per_apartment": {}}

        if bill_total_kwh == 0:
            self.warnings.append("Gas: bill_total_kWh fehlt auf Gasrechnung. Bitte in Dokumentendetails nachtragen.")
            return {"total_cost": total_cost, "per_apartment": {}, "error": "kWh fehlt"}

        bill_total_kwh = bill_total_kwh  # already summed above

        zenner_readings = {}
        for code, apt in apt_by_code.items():
            if not apt.get("has_zenner_meter"):
                continue
            zr = readings["zenner_heat"].get(code, {})
            z_start = zr.get("start")
            z_end = zr.get("end")

            if z_start is None or z_end is None:
                self.warnings.append(f"Gas: Zenner-Zähler {code} (Start/End) fehlt für {year}.")
                zenner_readings[code] = {"mwh_start": Decimal("0"), "mwh_end": Decimal("0")}
                continue

            zenner_readings[code] = {"mwh_start": z_start, "mwh_end": z_end}

        if not zenner_readings:
            self.warnings.append("Gas: Keine Zenner-Zähler konfiguriert. Gas-Kosten können nicht verteilt werden.")
            return {"total_cost": total_cost, "per_apartment": {}}

        calc = GasHeatCalculation(total_cost, bill_total_kwh, self.factor_min, self.factor_max)
        per_apt = calc.calculate(zenner_readings)
        self.warnings.extend(calc.warnings)

        return {
            "total_cost": total_cost,
            "bill_total_kwh": bill_total_kwh,
            "per_apartment": per_apt,
        }

    def _calc_fixed_costs(self, documents: List[Dict], occupancy: Dict, year: int) -> Dict:
        allocator = FixedCostAllocation()
        result = {}

        type_to_scheme = {
            "rainwater_fee_invoice": "rainwater",
            "electricity_common_invoice": "electricity_common",
            "property_tax_notice": "property_tax",
            "insurance_invoice": "insurance",
            "maintenance_invoice": "maintenance",
            "chimney_sweep_invoice": "chimney_sweep",
        }

        for doc_type, scheme in type_to_scheme.items():
            docs = [
                d for d in documents
                if d["document_type"] == doc_type
                and d.get("is_billable")
                and d.get("total_amount")
            ]
            if not docs:
                continue

            total = Decimal("0")
            for d in docs:
                amount = Decimal(str(d["total_amount"]))
                pf = d.get("service_period_from")
                pt = d.get("service_period_to")
                if pf and pt:
                    if isinstance(pf, str):
                        pf = date.fromisoformat(pf)
                    if isinstance(pt, str):
                        pt = date.fromisoformat(pt)
                    amount = prorate_by_period(amount, pf, pt, year)
                total += amount

            if total == 0:
                continue

            per_apt = allocator.allocate(scheme, total, occupancy, year)
            result[scheme] = {
                "total_cost": total,
                "per_apartment": {k: str(v) for k, v in per_apt.items()},
            }

        # Also handle rainwater_amount embedded in water invoices
        water_with_rainwater = [
            d for d in documents
            if d["document_type"] == "water_invoice"
            and d.get("is_billable")
            and d.get("rainwater_amount")
        ]
        if water_with_rainwater:
            extra_rainwater = sum(Decimal(str(d["rainwater_amount"])) for d in water_with_rainwater)
            if "rainwater" in result:
                existing_total = Decimal(str(result["rainwater"]["total_cost"])) + extra_rainwater
                per_apt = allocator.allocate("rainwater", existing_total, occupancy, year)
                result["rainwater"] = {
                    "total_cost": existing_total,
                    "per_apartment": {k: str(v) for k, v in per_apt.items()},
                }
            else:
                per_apt = allocator.allocate("rainwater", extra_rainwater, occupancy, year)
                result["rainwater"] = {
                    "total_cost": extra_rainwater,
                    "per_apartment": {k: str(v) for k, v in per_apt.items()},
                }

        return result

    def _calc_waste(self, documents: List[Dict], bin_mappings: Dict, occupancy: Dict, year: int) -> Dict:
        waste_docs = [
            d for d in documents
            if d["document_type"] == "waste_invoice_evs"
            and d.get("is_billable")
            and d.get("total_amount")
        ]

        if not waste_docs:
            return {"total_cost": Decimal("0"), "per_apartment": {}}

        all_lines = []
        for d in waste_docs:
            ai_data = d.get("ai_json") or {}
            bins = ai_data.get("bins", [])
            for b in bins:
                raw_id = str(b.get("bin_id", "")).strip()
                bin_id = raw_id.lstrip("0") or raw_id
                amount = Decimal("0")
                if b.get("base_fee"):
                    amount += Decimal(str(b["base_fee"]))
                for emp in b.get("emptyings", []):
                    amount += Decimal(str(emp.get("amount", "0")))
                for extra in b.get("extra_emptyings", []):
                    amount += Decimal(str(extra.get("amount", "0")))
                if b.get("total"):
                    amount = Decimal(str(b["total"]))

                bin_size = b.get("bin_size", "")
                std_count = sum(int(emp.get("count", 0)) for emp in b.get("emptyings", []))
                extra_count = sum(int(emp.get("count", 0)) for emp in b.get("extra_emptyings", []))
                total_emptyings = std_count + extra_count
                desc_parts = [f"EVS Tonne {bin_id}"]
                if bin_size:
                    desc_parts.append(f"({bin_size})")
                if extra_count > 0:
                    desc_parts.append(
                        f"– {std_count} Standard- + {extra_count} Zusatzleerung{'en' if extra_count != 1 else ''}"
                        f" = {total_emptyings} Leerungen"
                    )
                elif std_count > 0:
                    desc_parts.append(f"– {std_count} Leerung{'en' if std_count != 1 else ''}")

                all_lines.append({
                    "bin_id": bin_id,
                    "description": " ".join(desc_parts),
                    "amount": amount,
                    "period_from": d.get("service_period_from"),
                    "period_to": d.get("service_period_to"),
                    "bin_size": bin_size,
                    "std_count": std_count,
                    "extra_count": extra_count,
                    "total_emptyings": total_emptyings,
                    "emptyings": b.get("emptyings", []),
                    "extra_emptyings": b.get("extra_emptyings", []),
                    "base_fee": float(b["base_fee"]) if b.get("base_fee") else None,
                })

        if not all_lines:
            total = sum(Decimal(str(d["total_amount"])) for d in waste_docs)
            self.warnings.append("Müll: Keine Tonnen-Details aus KI-Extraktion. Bitte EVS-Rechnung in KI-Inbox prüfen.")
            return {"total_cost": total, "per_apartment": {}}

        calc = WasteCostCalculation()
        per_apt = calc.calculate(all_lines, bin_mappings, year, occupancy, self.warnings)

        total = sum(Decimal(str(d["total_amount"])) for d in waste_docs)
        return {
            "total_cost": total,
            "per_apartment": {k: {"cost": str(v["cost"]), "lines": v["lines"]} for k, v in per_apt.items()},
        }

    def _aggregate(
        self,
        apartments: List[Dict],
        occupancy: Dict,
        advance_payments: Dict,
        water: Dict,
        gas: Dict,
        fixed: Dict,
        waste: Dict,
        year: int,
        all_tenancies: Optional[Dict] = None,
        advance_by_tenancy: Optional[Dict] = None,
        split_fractions: Optional[Dict] = None,
    ) -> List[Dict]:
        """
        Returns a list of billing entries.
        Single-tenant apartments → 1 entry.
        Multi-tenant apartments  → 1 entry per tenant, costs split.
        """
        result: List[Dict] = []
        total_days = days_in_year(year)

        for apt in apartments:
            code = apt["code"]
            ten_list = (all_tenancies or {}).get(code, [])
            multi = len(ten_list) >= 2

            if not multi:
                breakdown: Dict = {}
                total = Decimal("0")

                water_apt = water.get("per_apartment", {}).get(code)
                if water_apt:
                    cost = _round2(Decimal(str(water_apt.get("cost", "0"))))
                    breakdown["water"] = {
                        "cost": str(cost),
                        "m3_adjusted": str(water_apt.get("m3_adjusted", "0")),
                        "factor": str(water_apt.get("factor", "1")),
                    }
                    total += cost

                gas_apt = gas.get("per_apartment", {}).get(code)
                if gas_apt:
                    cost = _round2(Decimal(str(gas_apt.get("cost", "0"))))
                    breakdown["gas"] = {
                        "cost": str(cost),
                        "kwh_adjusted": str(gas_apt.get("kwh_adjusted", "0")),
                        "factor": str(gas_apt.get("factor", "1")),
                    }
                    total += cost

                for scheme, data in fixed.items():
                    per_apt = data.get("per_apartment", {})
                    if code in per_apt:
                        cost = _round2(Decimal(str(per_apt[code])))
                        from .calculation_fixed import FixedCostAllocation
                        sd = FixedCostAllocation.SCHEMES.get(scheme, {})
                        breakdown[scheme] = {
                            "cost": str(cost),
                            "share": sd.get("shares", {}).get(code, 1),
                            "total_shares": sd.get("total_shares", 1),
                        }
                        total += cost

                waste_per = waste.get("per_apartment", {})
                if code in waste_per:
                    w_data = waste_per[code]
                    cost = _round2(Decimal(str(
                        w_data.get("cost", w_data) if isinstance(w_data, (str, int, float))
                        else w_data.get("cost", "0")
                    )))
                    breakdown["waste"] = {
                        "cost": str(cost),
                        "lines": w_data.get("lines", []) if isinstance(w_data, dict) else [],
                    }
                    total += cost

                occ = occupancy.get(code, {})
                tenancy_id = occ.get("tenancy_id")
                advance = _round2(
                    (advance_by_tenancy or {}).get(tenancy_id, Decimal("0"))
                    if (advance_by_tenancy and tenancy_id)
                    else advance_payments.get(code, Decimal("0"))
                )
                balance = _round2(total - advance)

                result.append({
                    "apartment_id": apt.get("id"),
                    "apartment_code": code,
                    "tenancy_id": tenancy_id,
                    "tenant_id": occ.get("tenant_id"),
                    "tenancy_start": str(occ.get("tenancy_start", date(year, 1, 1))),
                    "tenancy_end": str(occ.get("tenancy_end", date(year, 12, 31))),
                    "total_costs": str(total),
                    "advance_payments": str(advance),
                    "balance": str(balance),
                    "cost_breakdown": breakdown,
                    "days_occupied": days_in_period(
                        occ.get("tenancy_start", date(year, 1, 1)),
                        occ.get("tenancy_end", date(year, 12, 31)),
                        year,
                    ),
                })

            else:
                fracs: Tuple = (split_fractions or {}).get(code) or tuple(
                    Decimal("1") / Decimal(str(len(ten_list))) for _ in ten_list
                )

                water_apt = water.get("per_apartment", {}).get(code)
                gas_apt = gas.get("per_apartment", {}).get(code)
                waste_per = waste.get("per_apartment", {})

                for i, tenancy in enumerate(ten_list):
                    frac: Decimal = fracs[i] if i < len(fracs) else Decimal("0")
                    is_last = (i == len(ten_list) - 1)
                    days_occ = days_in_period(tenancy["start_date"], tenancy["end_date"], year)
                    breakdown = {}
                    total = Decimal("0")

                    if water_apt:
                        full = _round2(Decimal(str(water_apt.get("cost", "0"))))
                        if is_last:
                            prev = sum(_round2(full * fracs[j]) for j in range(i))
                            cost = _round2(full - prev)
                        else:
                            cost = _round2(full * frac)
                        m3 = _round2(Decimal(str(water_apt.get("m3_adjusted", "0"))) * frac)
                        breakdown["water"] = {
                            "cost": str(cost),
                            "m3_adjusted": str(m3),
                            "factor": str(water_apt.get("factor", "1")),
                        }
                        total += cost

                    if gas_apt:
                        full = _round2(Decimal(str(gas_apt.get("cost", "0"))))
                        if is_last:
                            prev = sum(_round2(full * fracs[j]) for j in range(i))
                            cost = _round2(full - prev)
                        else:
                            cost = _round2(full * frac)
                        kwh = _round2(Decimal(str(gas_apt.get("kwh_adjusted", "0"))) * frac)
                        breakdown["gas"] = {
                            "cost": str(cost),
                            "kwh_adjusted": str(kwh),
                            "factor": str(gas_apt.get("factor", "1")),
                        }
                        total += cost

                    for scheme_name, data in fixed.items():
                        per_apt = data.get("per_apartment", {})
                        if code not in per_apt:
                            continue
                        scheme_def = FixedCostAllocation.SCHEMES.get(scheme_name)
                        if scheme_def:
                            share = scheme_def["shares"].get(code, 0)
                            if share == 0:
                                continue
                            total_fixed = _round2(Decimal(str(data.get("total_cost", "0"))))
                            cost = prorate(total_fixed, days_occ, total_days, share, scheme_def["total_shares"])
                        else:
                            full = _round2(Decimal(str(per_apt[code])))
                            cost = _round2(full * frac)
                        from .calculation_fixed import FixedCostAllocation
                        sd2 = FixedCostAllocation.SCHEMES.get(scheme_name, {})
                        breakdown[scheme_name] = {
                            "cost": str(cost),
                            "share": sd2.get("shares", {}).get(code, 1),
                            "total_shares": sd2.get("total_shares", 1),
                        }
                        total += cost

                    if code in waste_per:
                        w_data = waste_per[code]
                        full = _round2(Decimal(str(
                            w_data.get("cost", "0") if isinstance(w_data, dict) else w_data
                        )))
                        if is_last:
                            prev = sum(_round2(full * fracs[j]) for j in range(i))
                            cost = _round2(full - prev)
                        else:
                            cost = _round2(full * frac)
                        breakdown["waste"] = {
                            "cost": str(cost),
                            "lines": w_data.get("lines", []) if isinstance(w_data, dict) else [],
                        }
                        total += cost

                    tid = tenancy["tenancy_id"]
                    advance = _round2((advance_by_tenancy or {}).get(tid, Decimal("0")))
                    balance = _round2(total - advance)

                    result.append({
                        "apartment_id": apt.get("id"),
                        "apartment_code": code,
                        "tenancy_id": tid,
                        "tenant_id": tenancy["tenant_id"],
                        "tenancy_start": str(tenancy["start_date"]),
                        "tenancy_end": str(tenancy["end_date"]),
                        "total_costs": str(total),
                        "advance_payments": str(advance),
                        "balance": str(balance),
                        "cost_breakdown": breakdown,
                        "days_occupied": days_occ,
                    })

        return result
