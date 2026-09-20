import re

from app.models import FieldMismatch

TEXT_FIELDS = ["shipper", "consignee", "notify_party", "port_of_loading", "port_of_discharge"]
NUMERIC_FIELDS = ["container_count", "gross_weight_kg"]


def _normalize_text(value) -> str:
    if value is None:
        return ""
    value = str(value).lower().strip()
    value = re.sub(r"[.,]", "", value)
    value = re.sub(r"\s+", " ", value)
    return value


def _values_match_text(si_value, bl_value) -> bool:
    """
    Exact match after normalization. Real-world notify parties/consignees sometimes
    carry extra suffixes (e.g. "c/o West Coast Logistics") that change who is
    actually notified -- that's a genuine discrepancy, not noise, so we do NOT
    do fuzzy/partial matching here.
    """
    return _normalize_text(si_value) == _normalize_text(bl_value)


def _values_match_numeric(si_value, bl_value) -> bool:
    try:
        return float(si_value) == float(bl_value)
    except (TypeError, ValueError):
        return _normalize_text(si_value) == _normalize_text(bl_value)


def compare_fields(si_fields: dict, bl_fields: dict) -> list[FieldMismatch]:
    """Compare the 7 shipment fields and return a list of mismatches (empty if none)."""
    mismatches: list[FieldMismatch] = []

    for field in TEXT_FIELDS:
        si_val, bl_val = si_fields.get(field), bl_fields.get(field)
        if not _values_match_text(si_val, bl_val):
            mismatches.append(FieldMismatch(field=field, si_value=str(si_val), bl_value=str(bl_val)))

    for field in NUMERIC_FIELDS:
        si_val, bl_val = si_fields.get(field), bl_fields.get(field)
        if not _values_match_numeric(si_val, bl_val):
            mismatches.append(FieldMismatch(field=field, si_value=str(si_val), bl_value=str(bl_val)))

    return mismatches
