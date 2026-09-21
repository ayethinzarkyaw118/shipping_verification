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
    parser.add_argument("source", help="Path to the extracted dataset folder, or the Docker server URL")
    parser.add_argument("--out", default="submission.json", help="Where to write the submission JSON")
    parser.add_argument("--submit", metavar="URL", help="POST the result to this server's /submit and print the scoreboard")
    args = parser.parse_args()

    inbox = Inbox(args.source)
    print(f"Loading emails from {args.source} ...", file=sys.stderr)
    emails = inbox.emails()
    print(f"{len(emails)} emails found. Running the pipeline (this calls Groq for each email - may take a while)...", file=sys.stderr)

    submission = build_submission(inbox)

    with open(args.out, "w") as f:
        json.dump(submission, f, indent=2)
    print(f"Wrote {args.out} ({len(submission)} entries)", file=sys.stderr)

    if args.submit:
        score_inbox = Inbox(args.submit)
        result = score_inbox.submit(submission)
        print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
