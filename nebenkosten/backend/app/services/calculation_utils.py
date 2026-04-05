"""Shared utility functions for billing calculations."""
from __future__ import annotations
from decimal import Decimal, ROUND_HALF_UP
from datetime import date

CENTS = Decimal("0.01")
THREE_DECIMALS = Decimal("0.001")


def _round2(v: Decimal) -> Decimal:
    return v.quantize(CENTS, rounding=ROUND_HALF_UP)


def days_in_year(year: int) -> int:
    return 366 if (year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)) else 365


def clamp_to_year(d: date, year: int) -> date:
    return max(d, date(year, 1, 1))


def days_in_period(start: date, end: date, year: int) -> int:
    """Days a tenant occupied the apartment within the given year."""
    year_start = date(year, 1, 1)
    year_end = date(year, 12, 31)
    effective_start = max(start, year_start)
    effective_end = min(end, year_end)
    if effective_start > effective_end:
        return 0
    return (effective_end - effective_start).days + 1


def prorate(
    total: Decimal,
    occupied_days: int,
    total_days: int,
    num_shares: int = 1,
    total_shares: int = 1,
) -> Decimal:
    """Pro-rata allocation: total * (share/total_shares) * (days/total_days)"""
    if total_days == 0 or total_shares == 0:
        return Decimal("0.00")
    result = total * Decimal(num_shares) / Decimal(total_shares) * Decimal(occupied_days) / Decimal(total_days)
    return _round2(result)


def prorate_by_period(total: Decimal, period_from: date, period_to: date, year: int) -> Decimal:
    """
    Returns the portion of `total` that falls within the calendar year.
    E.g. invoice 28.11.2024–31.05.2025, year=2024 → 34/185 × total
    If no overlap returns 0. Used for invoices with non-calendar billing periods.
    """
    year_start = date(year, 1, 1)
    year_end = date(year, 12, 31)
    effective_start = max(period_from, year_start)
    effective_end = min(period_to, year_end)
    if effective_end < effective_start:
        return Decimal("0.00")
    overlap_days = (effective_end - effective_start).days + 1
    total_days = (period_to - period_from).days + 1
    if total_days == 0:
        return Decimal("0.00")
    return _round2(total * Decimal(overlap_days) / Decimal(total_days))
