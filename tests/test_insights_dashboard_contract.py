from pathlib import Path


ROOT = Path(__file__).parents[1]


def test_insights_helpers_have_local_synonyms_and_actionable_focus():
    source = (ROOT / "src/lib/insights.ts").read_text(encoding="utf-8")
    assert "export function synonymsForWord" in source
    assert "export function derivePracticeFocus" in source
    assert ": []" in source


def test_insights_layout_is_bounded_and_interactive():
    source = (ROOT / "src/components/Home.tsx").read_text(encoding="utf-8")
    assert "insights-grid" in source
    assert "insights-context-button" in source
    assert "insights-word-button" in source
    assert "Practice focus" in source


def test_heatmap_has_an_internal_scroll_boundary():
    css = (ROOT / "src/index.css").read_text(encoding="utf-8")
    assert ".insights-heatmap-scroll" in css
    assert ".insights-page" in css
    assert "overflow-x: hidden" in css
