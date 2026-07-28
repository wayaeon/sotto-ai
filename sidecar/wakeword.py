"""Small, local keyword spotter used to gate background dictation."""
from __future__ import annotations

from array import array
import sys
from pathlib import Path

from .models import WAKE_WORD_DIR, WAKE_WORD_KEYWORDS_FILE, wake_word_model_ready


WAKE_PHRASE = "VERBA DICTATE"
# This GigaSpeech keyword model has uppercase BPE tokens only for this phrase.
# Lowercase `verba dictate` produces unknown tokens and cannot ever arm.
WAKE_PHRASE_VARIANTS = ("VERBA DICTATE",)
_KEYWORD_SCORE = 2.0
_KEYWORD_THRESHOLD = 0.20
_ENCODER = "encoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx"
_DECODER = "decoder-epoch-12-avg-2-chunk-16-left-64.onnx"
_JOINER = "joiner-epoch-12-avg-2-chunk-16-left-64.int8.onnx"


class WakeWordDetector:
    """One-thread local KWS stream. It never loads a transcription model."""

    def __init__(self, model_dir: Path = WAKE_WORD_DIR) -> None:
        ready, reason = wake_word_model_ready()
        if not ready:
            raise RuntimeError(reason)

        import sherpa_onnx

        self.prepare_keywords(model_dir)

        self._model_dir = model_dir
        self._spotter = sherpa_onnx.KeywordSpotter(
            tokens=str(model_dir / "tokens.txt"),
            encoder=str(model_dir / _ENCODER),
            decoder=str(model_dir / _DECODER),
            joiner=str(model_dir / _JOINER),
            keywords_file=str(WAKE_WORD_KEYWORDS_FILE),
            num_threads=1,
            keywords_score=_KEYWORD_SCORE,
            keywords_threshold=0.20,
            provider="cpu",
        )
        self._stream = self._spotter.create_stream()

    @staticmethod
    def prepare_keywords(model_dir: Path = WAKE_WORD_DIR) -> None:
        """Create the tokenized fixed phrase after the KWS assets are present."""
        import sentencepiece as spm

        tokenizer = spm.SentencePieceProcessor(model_file=str(model_dir / "bpe.model"))
        token_sets = [tokenizer.encode(phrase, out_type=str) for phrase in WAKE_PHRASE_VARIANTS]
        if not all(token_sets):
            raise RuntimeError("Wake phrase cannot be represented by the local model")
        lines = [f"{' '.join(tokens)} :2.0 #0.20 @VERBA_DICTATE" for tokens in token_sets]
        WAKE_WORD_KEYWORDS_FILE.parent.mkdir(parents=True, exist_ok=True)
        WAKE_WORD_KEYWORDS_FILE.write_text("\n".join(lines) + "\n", encoding="utf-8")

    def accept_pcm16(self, frame: bytes) -> bool:
        samples = array("h")
        samples.frombytes(frame)
        if sys.byteorder != "little":
            samples.byteswap()
        self._stream.accept_waveform(16000, [sample / 32768.0 for sample in samples])
        while self._spotter.is_ready(self._stream):
            self._spotter.decode_stream(self._stream)
        result = self._spotter.get_result(self._stream).upper().replace("_", " ")
        if result == WAKE_PHRASE:
            self._spotter.reset_stream(self._stream)
            return True
        return False

    def close(self) -> None:
        self._stream = None

    def reset(self) -> None:
        if self._stream is not None:
            self._spotter.reset_stream(self._stream)
