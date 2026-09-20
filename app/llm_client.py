
from __future__ import annotations

import json
import re

from groq import Groq

from app.config import GROQ_API_KEY, MODEL_NAME

_client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None


class LLMError(Exception):
    """Raised when the LLM call fails or returns unparseable output."""


def _strip_code_fences(text: str) -> str:
    text = text.strip()
    text = re.sub(r"^```(json)?", "", text).strip()
    text = re.sub(r"```$", "", text).strip()
    return text


def call_json(system_prompt: str, user_prompt: str, max_tokens: int = 1024) -> dict:
    """
    Calling the model with instructions to return ONLY a JSON object, and parse it.
    Raises LLMError if the client isn't configured or the response isn't valid JSON.
    """
    if _client is None:
        raise LLMError("GROQ_API_KEY is not set - cannot call the LLM.")

    try:
        response = _client.chat.completions.create(
            model=MODEL_NAME,
            max_tokens=max_tokens,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        )
    except Exception as exc:  # network/auth/rate-limit errors etc.
        raise LLMError(f"LLM call failed: {exc}") from exc

    raw_text = response.choices[0].message.content or ""
    cleaned = _strip_code_fences(raw_text)

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise LLMError(f"Could not parse LLM output as JSON: {raw_text!r}") from exc
