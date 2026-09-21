from __future__ import annotations

import logging

from supabase import Client, create_client

from app.config import SUPABASE_KEY, SUPABASE_URL
from app.models import EmailResult


logger = logging.getLogger(__name__)

_client: Client | None = (
    create_client(SUPABASE_URL, SUPABASE_KEY)
    if SUPABASE_URL and SUPABASE_KEY
    else None
)


def is_configured() -> bool:
    return _client is not None


def save_result(result: EmailResult) -> None:
    """
    Persist a result when Supabase is configured.

    Persistence is best-effort: database/network failures are logged but do not
    make the API request fail, because the classification/comparison result is
    still useful to the caller.
    """
    if _client is None:
        return

    try:
        _client.table("email_results").upsert(
            {
                "email_id": result.email_id,
                "category": result.category,
                "mismatch_found": result.mismatch_found,
                "mismatches": [m.model_dump() for m in result.mismatches],
                "summary": result.summary,
                "needs_review": result.needs_review,
            }
        ).execute()

        if result.needs_review and result.escalation:
            _client.table("review_queue").upsert(
                {
                    "email_id": result.email_id,
                    "reason": result.escalation.reason,
                    "detail": result.escalation.detail,
                    "resolved": False,
                }
            ).execute()

    except Exception:
        logger.exception(
            "Supabase persistence failed for email_id=%s; returning pipeline result anyway.",
            result.email_id,
        )


def get_review_queue() -> list[dict]:
    """Return all unresolved escalated cases."""
    if _client is None:
        return []

    try:
        resp = _client.table("review_queue").select("*").eq("resolved", False).execute()
        return resp.data
    except Exception:
        logger.exception("Failed to read Supabase review queue.")
        return []


def resolve_review(email_id: str) -> None:
    if _client is None:
        return

    try:
        _client.table("review_queue").update(
            {"resolved": True}
        ).eq("email_id", email_id).execute()
    except Exception:
        logger.exception(
            "Failed to resolve Supabase review item for email_id=%s.",
            email_id,
        )
