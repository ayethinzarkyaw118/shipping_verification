"""
Run the pipeline over the hackathon dataset and produce submission.json,
matching the exact shape score_cli.py / the Docker server expects.

Usage:
    export GROQ_API_KEY=your_key
    python build_submission.py /path/to/bundle
    python build_submission.py http://localhost:8080          # via the Docker server
    python build_submission.py /path/to/bundle --submit http://localhost:8080

The last form builds the submission AND immediately POSTs it to the running
Docker server's /submit endpoint for a live scoreboard.
"""
import argparse
import json
import sys

from app.loader import Inbox
from app.pipeline import build_submission


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source", help="Path to the participant ZIP, extracted dataset folder, or Docker server URL")
    parser.add_argument("--out", default="submission.json", help="Where to write the submission JSON")
    parser.add_argument("--submit", metavar="URL", help="POST the result to this server's /submit and print the scoreboard")
    args = parser.parse_args()

    inbox = Inbox(args.source)
    print(f"Loading emails from {args.source} ...", file=sys.stderr)
    emails = inbox.emails()
    print(f"{len(emails)} emails found. Running the pipeline (this calls Groq for each email - may take a while)...", file=sys.stderr)

    submission = build_submission(inbox)

    # Validate against the participant bundle's sample submission so a file
    # cannot be submitted with missing/extra email IDs or an invalid schema.
    sample = inbox.sample_submission()
    required_fields = {"category", "status", "review_reason", "defect_fields", "has_defect"}
    allowed_categories = {"BL_COMPARISON", "SI_REQUEST", "INVOICE_QUERY", "GENERAL", "SPAM"}
    allowed_statuses = {"OK", "MISMATCH", "NEEDS_REVIEW"}
    allowed_reasons = {None, "wrong_doc_type", "missing_attachment", "unreadable", "missing_value"}
    allowed_defect_fields = {
        "shipper", "consignee", "notify_party", "port_of_loading",
        "port_of_discharge", "container_count", "gross_weight_kg",
    }

    expected_ids = set(sample)
    actual_ids = set(submission)
    if expected_ids != actual_ids:
        missing = sorted(expected_ids - actual_ids)
        extra = sorted(actual_ids - expected_ids)
        raise SystemExit(
            f"Submission ID validation failed. Missing={missing[:10]} Extra={extra[:10]}"
        )

    for email_id, row in submission.items():
        if set(row) != required_fields:
            raise SystemExit(
                f"{email_id}: expected fields {sorted(required_fields)}, got {sorted(row)}"
            )
        if row["category"] not in allowed_categories:
            raise SystemExit(f"{email_id}: invalid category {row['category']!r}")
        if row["status"] not in allowed_statuses:
            raise SystemExit(f"{email_id}: invalid status {row['status']!r}")
        if row["review_reason"] not in allowed_reasons:
            raise SystemExit(f"{email_id}: invalid review_reason {row['review_reason']!r}")
        if not isinstance(row["has_defect"], bool):
            raise SystemExit(f"{email_id}: has_defect must be boolean")
        if not isinstance(row["defect_fields"], list):
            raise SystemExit(f"{email_id}: defect_fields must be a list")
        invalid_fields = set(row["defect_fields"]) - allowed_defect_fields
        if invalid_fields:
            raise SystemExit(f"{email_id}: invalid defect fields {sorted(invalid_fields)}")

    print(f"Validated {len(submission)}/{len(sample)} required email entries.", file=sys.stderr)

    with open(args.out, "w") as f:
        json.dump(submission, f, indent=2)
    print(f"Wrote {args.out} ({len(submission)} entries)", file=sys.stderr)

    if args.submit:
        score_inbox = Inbox(args.submit)
        result = score_inbox.submit(submission)
        print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()

