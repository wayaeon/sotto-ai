from pathlib import Path


ROOT = Path(__file__).parents[1]


def test_history_uses_a_responsive_workspace_layout():
    home = (ROOT / "src" / "components" / "Home.tsx").read_text(encoding="utf-8")
    css = (ROOT / "src" / "index.css").read_text(encoding="utf-8")
    assert "history-screen" in home
    assert "history-toolbar" in home
    assert "history-layout" in home
    assert "history-detail" in home
    assert ".history-layout.has-detail" in css
    assert "@media (max-width: 900px)" in css


def test_history_rows_expose_context_without_the_old_flat_list_contract():
    home = (ROOT / "src" / "components" / "Home.tsx").read_text(encoding="utf-8")
    css = (ROOT / "src" / "index.css").read_text(encoding="utf-8")
    assert "history-row-title" in home
    assert "history-row-preview" in home
    assert "history-row-footer" in home
    assert ".history-row.selected" in css
    assert ".list-row" not in home[home.index("function HistoryScreen"):home.index("// ─── Activity Heatmap")]


def test_transcript_detail_keeps_copy_delete_and_removes_unused_actions():
    source = (ROOT / "src/components/Home.tsx").read_text(encoding="utf-8")
    detail = source[source.index("function HistoryScreen"):source.index("// ─── Activity Heatmap")]
    assert "Copy" in detail
    assert "Delete" in detail
    assert "Download" not in detail
    assert "Edit" not in detail
    assert "updateTranscription" not in detail


def test_transcript_analysis_is_scheduled_after_persistence():
    hook = (ROOT / "src/hooks/useSidecar.ts").read_text(encoding="utf-8")
    assert "scheduleTranscriptAnalysis" in hook
    assert "insertTranscription(" in hook
