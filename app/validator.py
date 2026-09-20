"""
Validation stage (normal Python logic, not AI).

This stage checks whether the comparison result is reliable enough to be
marked as OK or MISMATCH, or whether it needs human review. If review is
needed, it also gives the reason using the four review types required by
the hackathon: wrong_doc_type, missing_attachment, unreadable, and
missing_value.

missing_attachment and unreadable are handled earlier in the pipeline,
before document extraction. This stage mainly checks wrong_doc_type and
missing_value, which can only be identified after the document has been
processed.

wrong_doc_type means the document does not look like a proper SI or BL.
For example, someone may have uploaded a Commercial Invoice instead.
If none of the 7 required fields can be found, the document is probably
the wrong type.

missing_value means the document is the correct type, but one or more
required fields are empty, marked as "N/A", or could not be parsed.
This means the information is missing from the document itself, rather
than the document being the wrong type.
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
