from __future__ import annotations

from app.llm_client import LLMError, call_json

SYSTEM_PROMPT = """given file names
Respond ONLY with JSON:
{"si_file": "<SI filename>", "bl_file": "<BL filename>"}
"""

def _keyword_match(attachments: list[str]) -> tuple[str | None, str | None]:
    si_name = next((name for name in attachments if "si" in name.lower()), None)
    bl_name = next((name for name in attachments if "bl" in name.lower()), None)
    return si_name, bl_name


def find_si_and_bl(attachments: list[str], read_text) -> tuple[str | None, str | None]:
  
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