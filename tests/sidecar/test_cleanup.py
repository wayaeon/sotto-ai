from sidecar.cleanup import restore_readable_transcript, strip_filler_words


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


def test_strip_filler_words_removes_single_word_with_surrounding_comma():
    assert (
        strip_filler_words("Um, I think this is great", ["um"])
        == "I think this is great"
    )


def test_strip_filler_words_removes_multi_word_phrase():
    assert (
        strip_filler_words("I think, you know, this works", ["you know"])
        == "I think this works"
    )


def test_strip_filler_words_removes_multiple_chained_fillers():
    assert (
        strip_filler_words("Um, uh, I think so", ["um", "uh"])
        == "I think so"
    )


def test_strip_filler_words_is_case_insensitive():
    assert strip_filler_words("LIKE this is cool", ["like"]) == "This is cool"


def test_strip_filler_words_noop_when_word_not_present():
    assert (
        strip_filler_words("Already readable, thanks.", ["like"])
        == "Already readable, thanks."
    )


def test_strip_filler_words_noop_with_empty_list():
    assert strip_filler_words("Um, hello", []) == "Um, hello"


def test_strip_filler_words_does_not_match_substring():
    assert (
        strip_filler_words("The umbrella is red", ["um"])
        == "The umbrella is red"
    )


def test_strip_filler_words_recapitalizes_after_mid_string_sentence_boundary():
    assert (
        strip_filler_words("Great point. Um, that's odd.", ["um"])
        == "Great point. That's odd."
    )
