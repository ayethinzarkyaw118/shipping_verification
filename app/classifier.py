from app.config import EMAIL_CATEGORIES
from app.llm_client import LLMError, call_json
from app.models import ClassificationResult

import logging

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = f"""classify incoming emails for a shipping operations inbox.

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


def classify_email(email: dict) -> ClassificationResult:
    user_prompt = (
        f"From: {email.get('from', '')}\n"
        f"Subject: {email.get('subject', '')}\n"
        f"Body:\n{email.get('body', '')}\n"
        f"Attachments: {email.get('attachments', [])}\n"
    )
    try:
        result = call_json(SYSTEM_PROMPT, user_prompt)
    except LLMError:
        logger.exception("Groq classification failed")
        return ClassificationResult(
            category="GENERAL",
            confidence=0.0,
            reason="classification failed",
    )

