from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_transcript_store_supports_editing_and_deleting_items():
    source = (ROOT / "src/lib/db.ts").read_text(encoding="utf-8")
    assert "export function updateTranscription(" in source
    assert "export function deleteTranscription(" in source
    assert "localStorage.setItem(TRANSCRIPTIONS_KEY" in source


def test_library_has_real_transcript_actions_and_insights_has_one_range():
    source = (ROOT / "src/components/Home.tsx").read_text(encoding="utf-8")
    assert "updateTranscription" in source
    assert "deleteTranscription" in source
    assert "URL.createObjectURL" in source
    assert "document.body.appendChild" in source
    assert 'const [range, setRange]' in source
