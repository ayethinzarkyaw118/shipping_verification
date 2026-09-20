from app.attachment_finder import find_si_and_bl
from app.classifier import classify_email
from app.comparator import compare_fields
from app.config import COMPARISON_CATEGORY, STATUS_MISMATCH, STATUS_NEEDS_REVIEW, STATUS_OK
from app.document_reader import UnreadableDocument, read_as_text
from app.extractor import extract_fields
from app.llm_client import LLMError
from app.loader import Inbox
from app.models import EmailResult, EscalationInfo, FieldMismatch, SubmissionEntry
from app.normalizer import normalize_fields
from app.supabase_client import save_result
from app.validator import validate


def _read_document_text(inbox: Inbox, att_path: str) -> str:
    raw_bytes = inbox.read_bytes(att_path)
    return read_as_text(att_path, raw_bytes)


def process_email(email: dict, inbox: Inbox) -> EmailResult:
    result = _build_result(email, inbox)
    save_result(result)
    return result


def _build_result(email: dict, inbox: Inbox) -> EmailResult:
    email_id = email["email_id"]

    # 1. classifier (AI)
    classification = classify_email(email)

    if classification.category != COMPARISON_CATEGORY:
        # Ground truth never expects MISMATCH/NEEDS_REVIEW outside BL_COMPARISON.
        return EmailResult(
            email_id=email_id,
            category=classification.category,
            summary=f"Classified as {classification.category}; no comparison performed.",
            needs_review=False,
        )

    # 2. attachment finder (AI, if needed)
    attachments = email.get("attachments", [])
    si_name, bl_name = find_si_and_bl(attachments, inbox.read_text)

    if not si_name or not bl_name:
        return EmailResult(
            email_id=email_id,
            category=classification.category,
            summary="Comparison request but the SI and/or BL attachment could not be identified.",
            needs_review=True,
            escalation=EscalationInfo(
                reason="missing_attachment",
                detail=f"Expected an SI and a BL attachment, found: {attachments}",
            ),
        )

    # 3. document reading (txt/pdf/docx/xlsx -> text) + extraction (AI)
    try:
        si_text = _read_document_text(inbox, si_name)
        bl_text = _read_document_text(inbox, bl_name)
    except (UnreadableDocument, FileNotFoundError, OSError) as exc:
        return EmailResult(
            email_id=email_id,
            category=classification.category,
            summary="One or both attachments could not be read.",
            needs_review=True,
            escalation=EscalationInfo(reason="unreadable", detail=str(exc)),
        )

    try:
        si_raw = extract_fields(si_text)
        bl_raw = extract_fields(bl_text)
    except LLMError as exc:
        return EmailResult(
            email_id=email_id,
            category=classification.category,
            summary="Could not extract fields from the SI/BL attachments.",
            needs_review=True,
            escalation=EscalationInfo(reason="unreadable", detail=str(exc)),
        )

    # 4. normalization (Python logic)
    si_fields, si_failed = normalize_fields(si_raw)
    bl_fields, bl_failed = normalize_fields(bl_raw)

    # 5. comparison (Python logic)
    mismatches = compare_fields(si_fields, bl_fields)

    # 6. validation (Python logic) -> CONFIDENT / UNCERTAIN branch
    validation = validate(si_fields=si_fields, bl_fields=bl_fields, si_failed=si_failed, bl_failed=bl_failed)

    if not validation.confident:
        return EmailResult(
            email_id=email_id,
            category=classification.category,
            mismatch_found=bool(mismatches),
            mismatches=mismatches,
            summary="Result is uncertain and needs human review before it can be trusted.",
            needs_review=True,
            escalation=EscalationInfo(reason=validation.review_reason, detail=validation.detail),
        )

    # CONFIDENT -> OK or MISMATCH
    if mismatches:
        summary = "Mismatch found: " + "; ".join(
            f"{m.field} (SI: {m.si_value} / BL: {m.bl_value})" for m in mismatches
        )
    else:
        summary = "No mismatch detected."

    return EmailResult(
        email_id=email_id,
        category=classification.category,
        mismatch_found=bool(mismatches),
        mismatches=mismatches,
        summary=summary,
        needs_review=False,
    )


def to_submission_entry(result: EmailResult) -> SubmissionEntry:


    if result.needs_review:
        return SubmissionEntry(
            category=result.category,
            status=STATUS_NEEDS_REVIEW,
            review_reason=result.escalation.reason if result.escalation else "unreadable",
            defect_fields=[],
            has_defect=False,
        )
    if result.mismatch_found:
        return SubmissionEntry(
            category=result.category,
            status=STATUS_MISMATCH,
            review_reason=None,
            defect_fields=[m.field for m in result.mismatches],
            has_defect=True,
        )
    return SubmissionEntry(
        category=result.category,
        status=STATUS_OK,
        review_reason=None,
        defect_fields=[],
        has_defect=False,
    )


def run_pipeline(inbox: Inbox) -> list[EmailResult]:
    return [process_email(email, inbox) for email in inbox]


def build_submission(inbox: Inbox) -> dict:
    """Build the {email_id: {...}} dict ready to POST to /submit."""
    results = run_pipeline(inbox)
    return {r.email_id: to_submission_entry(r).model_dump() for r in results}
