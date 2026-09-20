from typing import Optional

from pydantic import BaseModel, Field


class Email(BaseModel):
    email_id: str
    from_: str = Field(alias="from")
    subject: str
    body: str
    attachments: list[str] = []

    model_config = {"populate_by_name": True}


class ClassificationResult(BaseModel):
    category: str
    confidence: float
    reason: str


class FieldMismatch(BaseModel):
    field: str
    si_value: str
    bl_value: str


class EscalationInfo(BaseModel):
    reason: str
    detail: str


class EmailResult(BaseModel):
    email_id: str
    category: str
    mismatch_found: Optional[bool] = None
    mismatches: list[FieldMismatch] = []
    summary: str
    needs_review: bool = False
    escalation: Optional[EscalationInfo] = None


class SubmissionEntry(BaseModel):
    """Exact shape the hackathon's self-evaluation endpoint expects."""

    category: str
    status: str  # OK | MISMATCH | NEEDS_REVIEW
    review_reason: Optional[str] = None  # wrong_doc_type | missing_attachment | unreadable | missing_value
    defect_fields: list[str] = []
    has_defect: bool = False
