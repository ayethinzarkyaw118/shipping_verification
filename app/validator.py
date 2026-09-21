"""
Validation stage (Python logic, not AI).

Decides whether a comparison result can be trusted (OK/MISMATCH) or needs a
human (NEEDS_REVIEW), and if so, WHY - using exactly the hackathon's four
review reasons: wrong_doc_type, missing_attachment, unreadable, missing_value.
(missing_attachment and unreadable are decided earlier in the pipeline, before
extraction even runs - this stage covers wrong_doc_type and missing_value,
which can only be known after extraction.)

wrong_doc_type: the attachment extracted almost nothing shipping-related -
    e.g. someone attached a Commercial Invoice instead of the SI/BL. If NONE
    of the 7 fields could be found in a document, it's very unlikely to
    actually be an SI or BL, however well the extraction prompt worked.

missing_value: the document is genuinely an SI/BL, but SOME field is blank,
    "N/A", or otherwise couldn't be parsed - a real gap in the source data,
    not a wrong document.
"""
from __future__ import annotations

from dataclasses import dataclass

from app.extractor import FIELDS

WRONG_DOC_TYPE = "wrong_doc_type"
MISSING_VALUE = "missing_value"


@dataclass
class ValidationResult:
    confident: bool
    review_reason: str | None = None
    detail: str = ""


def _is_wrong_doc_type(fields: dict) -> bool:
    """True if essentially nothing shipping-related was found in the document."""
    return all(fields.get(f) is None for f in FIELDS)


def validate(*, si_fields: dict, bl_fields: dict, si_failed: list[str], bl_failed: list[str]) -> ValidationResult:
    if _is_wrong_doc_type(si_fields):
        return ValidationResult(confident=False, review_reason=WRONG_DOC_TYPE, detail="SI attachment does not look like a Shipping Instruction (no fields found)")
    if _is_wrong_doc_type(bl_fields):
        return ValidationResult(confident=False, review_reason=WRONG_DOC_TYPE, detail="BL attachment does not look like a draft Bill of Lading (no fields found)")

    si_missing = [f for f in FIELDS if f not in si_failed and si_fields.get(f) is None]
    bl_missing = [f for f in FIELDS if f not in bl_failed and bl_fields.get(f) is None]
    problems = si_failed + si_missing + bl_failed + bl_missing

    if problems:
        return ValidationResult(
            confident=False,
            review_reason=MISSING_VALUE,
            detail=f"Could not determine: SI missing/unparseable {si_failed + si_missing}, BL missing/unparseable {bl_failed + bl_missing}",
        )

    return ValidationResult(confident=True)
