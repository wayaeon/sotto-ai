from sidecar import benchmark


def test_normalize_transcript_keeps_words_and_digits():
    assert benchmark.normalize_transcript("Hello,  WORLD!! 123") == "hello world 123"


def test_word_error_rate_counts_substitution_insertion_and_deletion():
    result = benchmark.score_transcript(
        reference="this is an active test of the local program",
        hypothesis="this is a test of local program now",
    )

    assert result["reference_word_count"] == 9
    assert result["hypothesis_word_count"] == 8
    assert result["word_errors"] == 4
    assert result["wer"] == round(4 / 9, 4)


def test_character_error_rate_uses_normalized_text():
    result = benchmark.score_transcript(
        reference="Sotto writes clean text.",
        hypothesis="sotto writes clean texts",
    )

    assert result["cer"] > 0
    assert result["cer"] < 0.1


def test_score_transcript_returns_none_when_reference_missing():
    result = benchmark.score_transcript(reference=None, hypothesis="anything")

    assert result["wer"] is None
    assert result["cer"] is None
    assert result["word_errors"] is None
