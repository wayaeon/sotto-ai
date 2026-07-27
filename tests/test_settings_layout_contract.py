from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_settings_shell_reclaims_nav_width_and_top_gutter():
    source = (ROOT / "src/components/Home.tsx").read_text(encoding="utf-8")
    styles = (ROOT / "src/index.css").read_text(encoding="utf-8")
    assert 'className="main fade-in settings-main"' in source
    assert 'className="main-body settings-body"' in source
    assert '.settings-body { padding-top: 4px; padding-right: 20px; gap: 20px; }' in styles
    assert '.settings-nav { width: 176px;' in styles
