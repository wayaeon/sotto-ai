from sidecar.cleanup import restore_readable_transcript


def test_restore_readable_transcript_formats_zipformer_all_caps():
    assert (
        restore_readable_transcript("THIS IS A LOCAL TEST WITH ZIP FORMER")
        == "This is a local test with zip former."
    )


def test_restore_readable_transcript_handles_spoken_punctuation_and_i():
    assert (
        restore_readable_transcript("IM TESTING THIS COMMA AND I DONT LIKE THE OUTPUT")
        == "I'm testing this, and I don't like the output."
    )


def test_restore_readable_transcript_preserves_existing_mixed_case_punctuation():
    assert restore_readable_transcript("Already readable, thanks.") == "Already readable, thanks."
