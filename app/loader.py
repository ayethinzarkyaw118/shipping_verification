"""
Loader for the real hackathon dataset. Matches the organizers' own loader.py
interface, so the rest of the app can read from:

- an extracted local dataset folder,
- the original participant bundle ZIP directly, or
- the organizers' HTTP/Docker server.

Local folder layout:
    <source>/inbox/email_*.json
    <source>/attachments/...
    <source>/sample_submission.json

ZIP layout:
    inbox/email_*.json
    attachments/...
    sample_submission.json

HTTP server: GET /emails, GET /emails/{id}, GET /<attachment path>, POST /submit
"""
from __future__ import annotations

import json
import urllib.request
import zipfile
from pathlib import Path


class Inbox:
    def __init__(self, source: str):
        self.source = source.rstrip("/")
        self.is_http = self.source.startswith("http://") or self.source.startswith("https://")
        self.is_zip = not self.is_http and Path(self.source).suffix.lower() == ".zip"

    # -- listing ---------------------------------------------------------
    def emails(self) -> list[dict]:
        if self.is_http:
            return self._get_json("/emails")

        if self.is_zip:
            with zipfile.ZipFile(self.source) as bundle:
                names = sorted(
                    name
                    for name in bundle.namelist()
                    if name.startswith("inbox/email_") and name.endswith(".json")
                )
                return [json.loads(bundle.read(name).decode("utf-8")) for name in names]

        inbox_dir = Path(self.source) / "inbox"
        return [
            json.loads(p.read_text(encoding="utf-8"))
            for p in sorted(inbox_dir.glob("email_*.json"))
        ]

    def __iter__(self):
        return iter(self.emails())

    def get(self, email_id: str) -> dict:
        if self.is_http:
            return self._get_json(f"/emails/{email_id}")

        relative_path = f"inbox/{email_id}.json"
        if self.is_zip:
            with zipfile.ZipFile(self.source) as bundle:
                return json.loads(bundle.read(relative_path).decode("utf-8"))

        return json.loads(
            (Path(self.source) / relative_path).read_text(encoding="utf-8")
        )

    # -- attachments ----------------------------------------------------
    def read_bytes(self, att_path: str) -> bytes:
        """att_path is exactly as it appears in email['attachments'],
        e.g. 'attachments/email_004_SI.txt'."""
        if self.is_http:
            return self._get_bytes("/" + att_path.lstrip("/"))

        clean_path = att_path.lstrip("/")
        if self.is_zip:
            with zipfile.ZipFile(self.source) as bundle:
                return bundle.read(clean_path)

        return (Path(self.source) / clean_path).read_bytes()

    def read_text(self, att_path: str, encoding: str = "utf-8") -> str:
        return self.read_bytes(att_path).decode(encoding, errors="replace")

    # -- submission -----------------------------------------------------
    def submit(self, submission: dict) -> dict:
        if not self.is_http:
            raise RuntimeError("submit() needs an HTTP source; run the docker server")
        data = json.dumps(submission).encode()
        req = urllib.request.Request(
            self.source + "/submit",
            data=data,
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read())

    def sample_submission(self) -> dict:
        if self.is_http:
            return self._get_json("/sample_submission")

        if self.is_zip:
            with zipfile.ZipFile(self.source) as bundle:
                return json.loads(bundle.read("sample_submission.json").decode("utf-8"))

        return json.loads(
            (Path(self.source) / "sample_submission.json").read_text(encoding="utf-8")
        )

    # -- http helpers ---------------------------------------------------
    def _get_json(self, path: str):
        with urllib.request.urlopen(self.source + path) as r:
            return json.loads(r.read())

    def _get_bytes(self, path: str) -> bytes:
        with urllib.request.urlopen(self.source + path) as r:
            return r.read()
