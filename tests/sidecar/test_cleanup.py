import pytest
from unittest.mock import patch, MagicMock
from sidecar.cleanup import LocalCleanup, CloudCleanup
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


def test_local_cleanup_returns_original_on_failure():
    cleaner = LocalCleanup()
    # No Ollama running — should return original text
    result = cleaner.clean("hello world")
    assert result == "hello world"


def test_local_cleanup_returns_cleaned_text():
    cleaner = LocalCleanup()
    mock_resp = MagicMock()
    mock_resp.json.return_value = {"response": "Hello, world."}
    mock_resp.raise_for_status = MagicMock()

    with patch("requests.post", return_value=mock_resp):
        result = cleaner.clean("hello world")
    assert result == "Hello, world."


def test_cloud_cleanup_returns_original_without_api_key():
    cleaner = CloudCleanup(api_key="")
    result = cleaner.clean("test text")
    assert result == "test text"


def test_cloud_cleanup_calls_anthropic():
    cleaner = CloudCleanup(api_key="sk-test")
    mock_client = MagicMock()
    mock_msg = MagicMock()
    mock_msg.content = [MagicMock(text="Test text.")]
    mock_client.messages.create.return_value = mock_msg

    with patch("anthropic.Anthropic", return_value=mock_client):
        result = cleaner.clean("test text")
    assert result == "Test text."
