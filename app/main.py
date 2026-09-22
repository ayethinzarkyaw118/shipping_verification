from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.config import INBOX_SOURCE
from app.loader import Inbox
from app.models import EmailResult
from app.pipeline import build_submission, process_email, run_pipeline
from app.supabase_client import get_review_queue, is_configured, resolve_review

app = FastAPI(
    title="Shipping Document Verification API",
    description="Classifies inbox emails and compares SI vs BL documents for shipment discrepancies.",
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    inbox = Inbox(INBOX_SOURCE)
    try:
        email_count = len(inbox.emails())
    except Exception:
        email_count = None
    return {
        "status": "ok",
        "supabase_configured": is_configured(),
        "email_count": email_count,
    }


@app.get("/emails")
def list_emails():
    """Return the raw inbox records (useful for a frontend to list emails)."""
    inbox = Inbox(INBOX_SOURCE)
    return inbox.emails()


@app.get("/emails/{email_id}")
def get_email(email_id: str):
    """Return one raw email so the existing frontend View button can show its details."""
    inbox = Inbox(INBOX_SOURCE)
    try:
        return inbox.get(email_id)
    except (FileNotFoundError, OSError, KeyError):
        raise HTTPException(status_code=404, detail=f"Email {email_id} not found")


@app.get("/results", response_model=list[EmailResult])
def get_all_results():
    """Run the full pipeline over every email, persisting each to Supabase."""
    inbox = Inbox(INBOX_SOURCE)
    return run_pipeline(inbox)


@app.get("/results/{email_id}", response_model=EmailResult)
def get_one_result(email_id: str):
    """Run the pipeline for a single email by id."""
    inbox = Inbox(INBOX_SOURCE)
    try:
        email = inbox.get(email_id)
    except (FileNotFoundError, OSError):
        raise HTTPException(status_code=404, detail=f"Email {email_id} not found")
    return process_email(email, inbox)


@app.get("/submission")
def get_submission():
    """
    Build the {email_id: {category, status, review_reason, has_defect,
    defect_fields}} dict exactly as the hackathon's self-evaluation endpoint
    expects. This is what build_submission.py also produces for scoring.
    """
    inbox = Inbox(INBOX_SOURCE)
    return build_submission(inbox)


@app.get("/review-queue")
def review_queue():
    """Unresolved escalated cases, from Supabase."""
    return get_review_queue()


@app.post("/review-queue/{email_id}/resolve")
def resolve(email_id: str):
    resolve_review(email_id)
    return {"email_id": email_id, "resolved": True}
