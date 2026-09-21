from __future__ import annotations

import json
import logging
import urllib.error
import urllib.parse
import urllib.request

from app.config import SUPABASE_KEY, SUPABASE_URL
from app.models import EmailResult


logger = logging.getLogger(__name__)


def is_configured() -> bool:
    return bool(SUPABASE_URL and SUPABASE_KEY)


def _rest_request(
    table: str,
    method: str = "GET",
    payload: dict | None = None,
    query: dict[str, str] | None = None,
    prefer: str | None = None,
):
    if not is_configured():
        return None

    base = SUPABASE_URL.rstrip("/")
    url = f"{base}/rest/v1/{table}"

    if query:
        url += "?" + urllib.parse.urlencode(query)

    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Accept": "application/json",
    }

    if payload is not None:
        headers["Content-Type"] = "application/json"

    if prefer:
        headers["Prefer"] = prefer

    data = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        headers=headers,
        method=method,
    )

    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            raw = response.read()
            if not raw:
                return None
            return json.loads(raw.decode("utf-8"))

    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"Supabase HTTP {exc.code} for {table}: {body}"
        ) from exc

    except urllib.error.URLError as exc:
        raise RuntimeError(
            f"Could not connect to Supabase at {base}: {exc.reason}"
        ) from exc


def save_result(result: EmailResult) -> None:
    """
    Persist a pipeline result to Supabase.

    Persistence is best-effort: a database/network problem is logged but does
    not make /results fail.
    """
    if not is_configured():
        return

    try:
        _rest_request(
            "email_results",
            method="POST",
            query={"on_conflict": "email_id"},
            prefer="resolution=merge-duplicates,return=minimal",
            payload={
                "email_id": result.email_id,
                "category": result.category,
                "mismatch_found": result.mismatch_found,
                "mismatches": [m.model_dump() for m in result.mismatches],
                "summary": result.summary,
                "needs_review": result.needs_review,
            },
        )

        if result.needs_review and result.escalation:
            _rest_request(
                "review_queue",
                method="POST",
                query={"on_conflict": "email_id"},
                prefer="resolution=merge-duplicates,return=minimal",
                payload={
                    "email_id": result.email_id,
                    "reason": result.escalation.reason,
                    "detail": result.escalation.detail,
                    "resolved": False,
                },
            )

    except Exception:
        logger.exception(
            "Supabase persistence failed for email_id=%s; returning pipeline result anyway.",
            result.email_id,
        )


def get_review_queue() -> list[dict]:
    """Return all unresolved escalated cases."""
    if not is_configured():
        return []

    try:
        data = _rest_request(
            "review_queue",
            query={
                "select": "*",
                "resolved": "eq.false",
            },
        )
        return data or []
    except Exception:
        logger.exception("Failed to read Supabase review queue.")
        return []


def resolve_review(email_id: str) -> None:
    if not is_configured():
        return

    try:
        _rest_request(
            "review_queue",
            method="PATCH",
            query={"email_id": f"eq.{email_id}"},
            prefer="return=minimal",
            payload={"resolved": True},
        )
    except Exception:
        logger.exception(
            "Failed to resolve Supabase review item for email_id=%s.",
            email_id,
        )
