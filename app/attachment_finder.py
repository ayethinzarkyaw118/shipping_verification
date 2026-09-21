"""
Attachment finder stage (the "attachment finder" box in the pipeline).

Responsibility: given a comparison-request email's attachment list, figure out
which file is the SI and which is the draft BL.

Most of the time this is a cheap filename check (no AI needed - "si_4471.txt"
obviously contains "si"). It only calls the LLM when the filenames don't give
it away, e.g. "shipment_docs_1.txt" and "shipment_docs_2.txt", where the model
reads a short snippet of each to tell them apart. This keeps the common case
fast and free, and only spends an AI call when it's actually needed - matching
the "AI (if needed)" label in the pipeline diagram.
"""
from __future__ import annotations

from app.llm_client import LLMError, call_json

SYSTEM_PROMPT = """You are given the filenames and the first few lines of two shipping documents.
One is a Shipping Instruction (SI), the other is a draft Bill of Lading (BL).

Respond with ONLY a JSON object, no other text:
{"si_file": "<filename that is the SI>", "bl_file": "<filename that is the BL>"}
"""


def _keyword_match(attachments: list[str]) -> tuple[str | None, str | None]:
    si_name = next((name for name in attachments if "si" in name.lower()), None)
    bl_name = next((name for name in attachments if "bl" in name.lower()), None)
    return si_name, bl_name


def find_si_and_bl(attachments: list[str], read_text) -> tuple[str | None, str | None]:
    """
    read_text: a callable (e.g. inbox.read_text) used only for the AI fallback,
    to peek at file contents when filenames alone don't identify SI vs BL.
    """
    si_name, bl_name = _keyword_match(attachments)
    if si_name and bl_name:
        return si_name, bl_name

    if len(attachments) != 2:
        # Can't safely guess with anything other than exactly two candidate files.
        return si_name, bl_name

    try:
        snippets = {name: read_text(name)[:300] for name in attachments}
        user_prompt = "\n\n".join(f"File: {name}\n{text}" for name, text in snippets.items())
        result = call_json(SYSTEM_PROMPT, user_prompt)
        return result.get("si_file"), result.get("bl_file")
    except (LLMError, FileNotFoundError, OSError):
        # AI fallback failed too - let the caller escalate rather than guess.
        return None, None
