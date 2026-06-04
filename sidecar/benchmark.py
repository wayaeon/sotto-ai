"""Benchmark scoring helpers for local ASR model comparisons."""
from __future__ import annotations

import re
from typing import Sequence


_NON_WORD_RE = re.compile(r"[^\w\s]", re.UNICODE)
_SPACE_RE = re.compile(r"\s+")


def normalize_transcript(text: str | None) -> str:
    """Normalize transcript text before WER/CER scoring."""
    if not text:
        return ""
    text = text.lower()
    text = _NON_WORD_RE.sub(" ", text)
    return _SPACE_RE.sub(" ", text).strip()


def _edit_distance(reference: Sequence[str], hypothesis: Sequence[str]) -> int:
    if not reference:
        return len(hypothesis)
    if not hypothesis:
        return len(reference)

    previous = list(range(len(hypothesis) + 1))
    for row_index, ref_item in enumerate(reference, start=1):
        current = [row_index]
        for col_index, hyp_item in enumerate(hypothesis, start=1):
            substitution = previous[col_index - 1] + (0 if ref_item == hyp_item else 1)
            insertion = current[col_index - 1] + 1
            deletion = previous[col_index] + 1
            current.append(min(substitution, insertion, deletion))
        previous = current
    return previous[-1]


def score_transcript(reference: str | None, hypothesis: str) -> dict[str, int | float | None]:
    """Return WER/CER-style scoring fields for benchmark results."""
    if not reference:
        return {
            "reference_word_count": None,
            "hypothesis_word_count": len(normalize_transcript(hypothesis).split()),
            "word_errors": None,
            "wer": None,
            "cer": None,
        }

    normalized_reference = normalize_transcript(reference)
    normalized_hypothesis = normalize_transcript(hypothesis)
    reference_words = normalized_reference.split()
    hypothesis_words = normalized_hypothesis.split()

    word_errors = _edit_distance(reference_words, hypothesis_words)
    char_errors = _edit_distance(list(normalized_reference), list(normalized_hypothesis))

    return {
        "reference_word_count": len(reference_words),
        "hypothesis_word_count": len(hypothesis_words),
        "word_errors": word_errors,
        "wer": round(word_errors / max(len(reference_words), 1), 4),
        "cer": round(char_errors / max(len(normalized_reference), 1), 4),
    }
