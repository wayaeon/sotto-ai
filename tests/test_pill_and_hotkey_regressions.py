from pathlib import Path


ROOT = Path(__file__).parents[1]


def test_pill_can_resize_from_its_collapsed_window():
    main = (ROOT / "src-tauri" / "src" / "main.rs").read_text(encoding="utf-8")
    assert ".resizable(true)" in main


def test_ptt_starts_regardless_of_ctrl_and_windows_key_press_order():
    hotkeys = (ROOT / "src-tauri" / "src" / "hotkeys.rs").read_text(encoding="utf-8")
    assert "meta_down" in hotkeys
    assert hotkeys.count("maybe_start_ptt") >= 3
