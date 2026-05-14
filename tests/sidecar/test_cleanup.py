import pytest
from unittest.mock import patch, MagicMock
from sidecar.cleanup import LocalCleanup, CloudCleanup


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
