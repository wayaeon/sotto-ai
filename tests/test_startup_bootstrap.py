from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_webview_has_a_local_dark_boot_surface_without_remote_font_blockers():
    document = (ROOT / "index.html").read_text(encoding="utf-8")
    styles = (ROOT / "src" / "index.css").read_text(encoding="utf-8")

    assert "background:#0a0a0c" in document
    assert "fonts.googleapis.com" not in document
    assert "fonts.googleapis.com" not in styles


def test_orb_component_does_not_export_its_internal_state_hook_to_fast_refresh():
    orb = (ROOT / "src" / "components" / "Orb.tsx").read_text(encoding="utf-8")

    assert "export function useOrbState" not in orb
