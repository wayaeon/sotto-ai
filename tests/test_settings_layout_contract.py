from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_settings_shell_reclaims_nav_width_and_top_gutter():
    home = (ROOT / "src/components/Home.tsx").read_text(encoding="utf-8")
    css = (ROOT / "src/index.css").read_text(encoding="utf-8")

    assert 'className="main fade-in settings-main"' in home
    assert 'className="main-body settings-body"' in home
    assert ".settings-main { overflow: hidden; }" in css
    assert ".settings-body > .card" in css
    assert "overflow-y: auto" in css
    assert ".settings-nav { width: 176px;" in css
