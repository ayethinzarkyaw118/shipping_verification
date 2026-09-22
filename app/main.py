from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse

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


@app.get("/email-view/{email_id}", response_class=HTMLResponse)
def view_email(email_id: str):
    """Human-readable email view used by the existing frontend View button."""
    inbox = Inbox(INBOX_SOURCE)
    try:
        email = inbox.get(email_id)
    except (FileNotFoundError, OSError, KeyError):
        raise HTTPException(status_code=404, detail=f"Email {email_id} not found")

    import html

    sender = html.escape(str(email.get("from", "")))
    subject = html.escape(str(email.get("subject", "")))
    body = html.escape(str(email.get("body", "")))
    attachments = email.get("attachments", []) or []

    attachment_html = (
        "<ul>" +
        "".join(f"<li>{html.escape(str(item))}</li>" for item in attachments) +
        "</ul>"
        if attachments
        else "<p>None</p>"
    )

    return HTMLResponse(
        f"""
        <!doctype html>
        <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>{subject}</title>
          <style>
            body {{
              margin: 0;
              background: #f4f7fb;
              color: #101828;
              font-family: Arial, sans-serif;
            }}
            .wrap {{
              max-width: 900px;
              margin: 40px auto;
              padding: 0 20px;
            }}
            .card {{
              background: white;
              border: 1px solid #e4e9ef;
              border-radius: 16px;
              padding: 28px;
              box-shadow: 0 8px 25px rgba(16,24,40,.05);
            }}
            h1 {{
              margin: 0 0 18px;
              font-size: 24px;
            }}
            .meta {{
              margin-bottom: 24px;
              color: #667085;
              line-height: 1.7;
            }}
            .label {{
              font-weight: 700;
              color: #344054;
            }}
            .body {{
              white-space: pre-wrap;
              line-height: 1.65;
              border-top: 1px solid #eef1f5;
              padding-top: 22px;
            }}
            .attachments {{
              margin-top: 28px;
              border-top: 1px solid #eef1f5;
              padding-top: 20px;
            }}
          </style>
        </head>
        <body>
          <div class="wrap">
            <div class="card">
              <h1>{subject}</h1>
              <div class="meta">
                <div><span class="label">Email ID:</span> {html.escape(email_id)}</div>
                <div><span class="label">From:</span> {sender}</div>
              </div>
              <div class="body">{body}</div>
              <div class="attachments">
                <div class="label">Attachments</div>
                {attachment_html}
              </div>
            </div>
          </div>
        </body>
        </html>
        """
    )


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
