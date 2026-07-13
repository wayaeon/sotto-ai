"""Transcript formatting for raw ASR output that lacks casing/punctuation."""
from __future__ import annotations

import re

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
