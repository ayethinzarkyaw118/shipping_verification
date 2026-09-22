import logging

from app.config import EMAIL_CATEGORIES
from app.llm_client import LLMError, call_json
from app.models import ClassificationResult


logger = logging.getLogger(__name__)


SYSTEM_PROMPT = f"""You classify incoming emails for a shipping operations inbox.

Categories (use exactly one, exact spelling):
- BL_COMPARISON: asks to check/compare/verify a draft Bill of Lading (BL) against a Shipping Instruction (SI)
- SI_REQUEST: submits a new Shipping Instruction, with no request to compare it against anything
- INVOICE_QUERY: asks about billing, invoices, charges, or payments
- GENERAL: operational updates, FYIs, or other legitimate messages needing no document action
- SPAM: unsolicited, irrelevant, or scam content

Valid categories: {EMAIL_CATEGORIES}

Respond with ONLY a JSON object, no other text:
{{"category": "<one of the categories above, exact spelling>", "confidence": <0.0-1.0>, "reason": "<one short sentence>"}}
"""


def _email_text(email: dict) -> str:
    return " ".join(
        [
            str(email.get("subject", "")),
            str(email.get("body", "")),
            " ".join(map(str, email.get("attachments", []))),
        ]
    ).lower()


def _looks_like_bl_comparison(email: dict) -> bool:
    text = _email_text(email)

    has_si = (
        "shipping instruction" in text
        or "_si" in text
        or " si " in f" {text} "
    )

    has_bl = (
        "bill of lading" in text
        or "draft bl" in text
        or "_bl" in text
        or " bl " in f" {text} "
    )

    asks_to_check = any(
        word in text
        for word in ("check", "compare", "verify", "confirm")
    )

    return has_si and has_bl and asks_to_check


def _looks_like_si_request(email: dict) -> bool:
    text = _email_text(email)
    subject = str(email.get("subject", "")).lower()

    request_terms = (
        "request si",
        "shipping instruction",
        "please find shipping instruction",
        "new shipping instruction",
    )

    return (
        any(term in subject for term in ("request si", "new shipping instruction"))
        or (
            any(term in text for term in request_terms)
            and not _looks_like_bl_comparison(email)
        )
    )


def _looks_like_spam(email: dict) -> bool:
    text = _email_text(email)

    spam_terms = (
        "one weird trick",
        "verify your account",
        "mailbox has exceeded",
        "storage limit",
        "crypto-invest",
        "avoid deactivation",
        "webmail-verify",
    )

    return any(term in text for term in spam_terms)


def _looks_like_invoice_query(email: dict) -> bool:
    text = _email_text(email)

    invoice_terms = (
        "invoice",
        "billing",
        "billed",
        "charge",
        "charges",
        "payment",
        "thc",
        "local charge",
        "cost breakdown",
        "breakdown",
    )

    question_terms = (
        "query",
        "please advise",
        "included",
        "separately",
        "how much",
        "what is",
        "breakdown",
    )

    return (
        any(term in text for term in invoice_terms)
        and any(term in text for term in question_terms)
    )


def classify_email(email: dict) -> ClassificationResult:
    # Deterministic rules for obvious cases avoid incorrect GENERAL results
    # when the LLM is unavailable or misclassifies a clear request.
    if _looks_like_bl_comparison(email):
        return ClassificationResult(
            category="BL_COMPARISON",
            confidence=0.95,
            reason="SI/BL comparison request detected.",
        )

    if _looks_like_si_request(email):
        return ClassificationResult(
            category="SI_REQUEST",
            confidence=0.95,
            reason="New Shipping Instruction request detected.",
        )

    if _looks_like_invoice_query(email):
        return ClassificationResult(
            category="INVOICE_QUERY",
            confidence=0.95,
            reason="Invoice or charges query detected.",
        )

    if _looks_like_spam(email):
        return ClassificationResult(
            category="SPAM",
            confidence=0.99,
            reason="Spam or phishing indicators detected.",
        )

    user_prompt = (
        f"From: {email.get('from', '')}\n"
        f"Subject: {email.get('subject', '')}\n"
        f"Body:\n{email.get('body', '')}\n"
        f"Attachments: {email.get('attachments', [])}\n"
    )

    try:
        result = call_json(SYSTEM_PROMPT, user_prompt)

    except LLMError as exc:
        logger.exception(
            "Classifier LLM error for email_id=%s: %s",
            email.get("email_id", "<unknown>"),
            exc,
        )

        return ClassificationResult(
            category="GENERAL",
            confidence=0.0,
            reason=f"classification failed: {exc}",
        )

    category = result.get("category", "GENERAL")
    if category not in EMAIL_CATEGORIES:
        category = "GENERAL"

    return ClassificationResult(
        category=category,
        confidence=float(result.get("confidence", 0.5)),
        reason=result.get("reason", ""),
    )
