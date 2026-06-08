"""LLM-based transcription cleanup — local (Ollama) and cloud (Claude Haiku)."""
from __future__ import annotations

import os
import re
import requests
from typing import Optional

CLEANUP_PROMPT = (
    "Fix transcription errors, punctuation, and capitalization. "
    "Return ONLY the corrected text with no explanation:\n\n{text}"
)

_CONTRACTIONS = {
    "cant": "can't",
    "couldnt": "couldn't",
    "didnt": "didn't",
    "doesnt": "doesn't",
    "dont": "don't",
    "im": "I'm",
    "ive": "I've",
    "ill": "I'll",
    "isnt": "isn't",
    "shouldnt": "shouldn't",
    "thats": "that's",
    "theres": "there's",
    "wasnt": "wasn't",
    "werent": "weren't",
    "wont": "won't",
    "wouldnt": "wouldn't",
    "youre": "you're",
}

_SPOKEN_PUNCTUATION = {
    "comma": ",",
    "period": ".",
    "full stop": ".",
    "question mark": "?",
    "exclamation point": "!",
    "exclamation mark": "!",
}


def restore_readable_transcript(text: str) -> str:
    """Apply cheap formatting for raw ASR streams that lack casing/punctuation."""
    cleaned = " ".join((text or "").strip().split())
    if not cleaned:
        return cleaned

    has_lower = any(ch.islower() for ch in cleaned)
    has_sentence_punctuation = any(ch in ".?!" for ch in cleaned)
    if has_lower and has_sentence_punctuation:
        return cleaned

    cleaned = cleaned.lower()
    for spoken, punctuation in _SPOKEN_PUNCTUATION.items():
        cleaned = re.sub(rf"\b{re.escape(spoken)}\b", punctuation, cleaned)

    cleaned = re.sub(r"\s+([,.?!])", r"\1", cleaned)
    cleaned = re.sub(r"([,.?!])([^\s])", r"\1 \2", cleaned)

    def replace_contraction(match: re.Match[str]) -> str:
        return _CONTRACTIONS.get(match.group(0), match.group(0))

    if _CONTRACTIONS:
        cleaned = re.sub(r"\b(" + "|".join(map(re.escape, _CONTRACTIONS)) + r")\b", replace_contraction, cleaned)

    cleaned = re.sub(r"\bi\b", "I", cleaned)

    chars = list(cleaned)
    capitalize_next = True
    for idx, char in enumerate(chars):
        if capitalize_next and char.isalpha():
            chars[idx] = char.upper()
            capitalize_next = False
        elif char in ".?!":
            capitalize_next = True
    cleaned = "".join(chars).strip()

    if cleaned and cleaned[-1] not in ".?!":
        cleaned += "."
    return cleaned


class LocalCleanup:
    """Ollama-backed cleanup using Qwen3."""

    def __init__(self, model: str = "qwen3:7b", base_url: str = "http://localhost:11434") -> None:
        self._model = model
        self._base_url = base_url

    def clean(self, text: str) -> str:
        try:
            resp = requests.post(
                f"{self._base_url}/api/generate",
                json={
                    "model": self._model,
                    "prompt": CLEANUP_PROMPT.format(text=text),
                    "stream": False,
                    "options": {"temperature": 0.1, "num_predict": 512},
                },
                timeout=10,
            )
            resp.raise_for_status()
            return resp.json().get("response", text).strip()
        except Exception:
            return text  # fall back to original on any error


class CloudCleanup:
    """Claude Haiku 4.5 cleanup via Anthropic API."""

    def __init__(self, api_key: Optional[str] = None) -> None:
        self._api_key = api_key or os.environ.get("ANTHROPIC_API_KEY", "")

    def clean(self, text: str) -> str:
        if not self._api_key:
            return text
        try:
            import anthropic
            client = anthropic.Anthropic(api_key=self._api_key)
            msg = client.messages.create(
                model="claude-haiku-4-5",
                max_tokens=512,
                messages=[{"role": "user", "content": CLEANUP_PROMPT.format(text=text)}],
            )
            return msg.content[0].text.strip()
        except Exception:
            return text
