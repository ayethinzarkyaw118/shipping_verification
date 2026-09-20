

from __future__ import annotations

import re

TEXT_FIELDS = ["shipper", "consignee", "notify_party", "port_of_loading", "port_of_discharge"]
NUMERIC_FIELDS = ["container_count", "gross_weight_kg"]


class NormalizationIssue(Exception):
  """Used when a raw value cannot be converted to the expected format."""

def _normalize_text(value) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    text = re.sub(r"\s+", " ", text)
    return text if text else None


def _parse_container_count(value) -> int | None:
    """'3 x 40ft' -> 3, '3' -> 3, '3 containers' -> 3."""
    if value is None:
        return None
    match = re.search(r"\d+", str(value))
    if not match:
        raise NormalizationIssue(f"Could not find a container count number in {value!r}")
    return int(match.group())


def _parse_weight_kg(value) -> float | None:
  
    if value is None:
        return None
    cleaned = str(value).replace(",", "")
    match = re.search(r"[\d.]+", cleaned)
    if not match:
        raise NormalizationIssue(f"Could not find a weight number in {value!r}")
    return float(match.group())


def normalize_fields(raw_fields: dict) -> tuple[dict, list[str]]:
 

    normalized: dict = {}
    failed: list[str] = []

    for field in TEXT_FIELDS:
        normalized[field] = _normalize_text(raw_fields.get(field))

    for field, parser in (("container_count", _parse_container_count), ("gross_weight_kg", _parse_weight_kg)):
        raw_value = raw_fields.get(field)
        try:
            normalized[field] = parser(raw_value)
        except NormalizationIssue:
            normalized[field] = None
            failed.append(field)

    return normalized, failed
