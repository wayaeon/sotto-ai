from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_windows_posture_bridge_drives_the_existing_event_channel():
    source = (ROOT / "src-tauri/src/tablet_posture.rs").read_text(encoding="utf-8")
    main = (ROOT / "src-tauri/src/main.rs").read_text(encoding="utf-8")
    assert "SM_CONVERTIBLESLATEMODE" in source
    assert '"tablet_posture"' in source
    assert "start_tablet_posture_bridge" in main


def test_touch_control_reuses_ptt_and_has_a_manual_fallback():
    pill = (ROOT / "src/components/Pill.tsx").read_text(encoding="utf-8")
    settings = (ROOT / "src/components/settings/GeneralTab.tsx").read_text(encoding="utf-8")
    assert "tabletPosture" in pill
    assert "always_show_touch_control" in pill
    assert "toggleHandsfree" not in pill
    assert "always_show_touch_control" in settings
