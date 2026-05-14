"""LLM-based transcription cleanup — local (Ollama) and cloud (Claude Haiku)."""
from __future__ import annotations

import os
import requests
from typing import Optional

CLEANUP_PROMPT = (
    "Fix transcription errors, punctuation, and capitalization. "
    "Return ONLY the corrected text with no explanation:\n\n{text}"
)


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
