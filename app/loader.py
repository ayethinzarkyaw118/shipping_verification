
from __future__ import annotations

import json
import urllib.request
from pathlib import Path


class Inbox:
    def __init__(self, source: str):
        self.source = source.rstrip("/")
        self.is_http = self.source.startswith("http://") or self.source.startswith("https://")

    # -- listing ---------------------------------------------------------
    def emails(self) -> list[dict]:
        if self.is_http:
            return self._get_json("/emails")
        inbox_dir = Path(self.source) / "inbox"
        return [json.loads(p.read_text()) for p in sorted(inbox_dir.glob("email_*.json"))]

    def __iter__(self):
        return iter(self.emails())

    def get(self, email_id: str) -> dict:
        if self.is_http:
            return self._get_json(f"/emails/{email_id}")
        return json.loads((Path(self.source) / "inbox" / f"{email_id}.json").read_text())

    # -- attachments -------------------------------------------------------
    def read_bytes(self, att_path: str) -> bytes:
        """att_path is exactly as it appears in email['attachments'],
        e.g. 'attachments/email_004_SI.txt'."""
        if self.is_http:
            return self._get_bytes("/" + att_path.lstrip("/"))
        return (Path(self.source) / att_path).read_bytes()

    def read_text(self, att_path: str, encoding: str = "utf-8") -> str:
        return self.read_bytes(att_path).decode(encoding, errors="replace")

    # -- submission --------------------------------------------------------
    def submit(self, submission: dict) -> dict:
        if not self.is_http:
            raise RuntimeError("submit() needs an HTTP source; run the docker server")
        data = json.dumps(submission).encode()
        req = urllib.request.Request(
            self.source + "/submit", data=data, headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read())

    def sample_submission(self) -> dict:
        if self.is_http:
            return self._get_json("/sample_submission")
        return json.loads((Path(self.source) / "sample_submission.json").read_text())

    # -- http helpers --------------------------------------------------------
    def _get_json(self, path: str):
        with urllib.request.urlopen(self.source + path) as r:
            return json.loads(r.read())

    def _get_bytes(self, path: str) -> bytes:
        with urllib.request.urlopen(self.source + path) as r:
            return r.read()
