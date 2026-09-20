
from __future__ import annotations

from supabase import Client, create_client

from app.config import SUPABASE_KEY, SUPABASE_URL
from app.models import EmailResult

_client: Client | None = create_client(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_URL and SUPABASE_KEY else None


def is_configured() -> bool:
    return _client is not None


def save_result(result: EmailResult) -> None:

    if _client is None:
        return  # Supabase not configured - pipeline still works, just without persistence

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


def get_review_queue() -> list[dict]:
    """Return all unresolved escalated cases."""
    if _client is None:
        return []
    resp = _client.table("review_queue").select("*").eq("resolved", False).execute()
    return resp.data


def resolve_review(email_id: str) -> None:
    if _client is None:
        return
    _client.table("review_queue").update({"resolved": True}).eq("email_id", email_id).execute()
