from pathlib import Path


ROOT = Path(__file__).parents[1]


def test_local_transcript_analysis_is_persisted_separately_from_verbatim_text():
    source = (ROOT / "src/lib/transcriptAnalysis.ts").read_text(encoding="utf-8")
    assert "export interface TranscriptAnalysis" in source
    assert "verba_transcript_analysis" in source
    assert "raw_word_count" in source
    assert "quality_flags" in source
    assert "export function scheduleTranscriptAnalysis" in source


def test_sidecar_hook_schedules_analysis_after_history_insert():
    hook = (ROOT / "src/hooks/useSidecar.ts").read_text(encoding="utf-8")
    assert 'from "../lib/transcriptAnalysis"' in hook
    assert "const saved = insertTranscription(" in hook
    assert "scheduleTranscriptAnalysis(saved);" in hook


def test_insights_surfaces_analysis_signals_without_claiming_accuracy():
    home = (ROOT / "src/components/Home.tsx").read_text(encoding="utf-8")
    assert "getTranscriptAnalyses" in home
    assert "Accuracy signals" in home
    assert "Review flags" in home
