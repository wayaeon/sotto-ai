import json
from pathlib import Path


ROOT = Path(__file__).parents[1]


def test_pill_can_resize_from_its_collapsed_window():
    main = (ROOT / "src-tauri" / "src" / "main.rs").read_text(encoding="utf-8")
    assert ".resizable(true)" in main


def test_pill_can_read_its_monitor_before_resizing():
    capability = json.loads((ROOT / "src-tauri" / "capabilities" / "default.json").read_text(encoding="utf-8"))
    assert "core:window:allow-current-monitor" in capability["permissions"]
    assert "core:event:allow-listen" in capability["permissions"]


def test_ptt_starts_regardless_of_ctrl_and_alt_key_press_order():
    hotkeys = (ROOT / "src-tauri" / "src" / "hotkeys.rs").read_text(encoding="utf-8")
    assert "alt_down" in hotkeys
    assert "MetaLeft" not in hotkeys
    assert hotkeys.count("maybe_start_ptt") >= 3


def test_middle_mouse_button_remains_available_to_other_apps():
    hotkeys = (ROOT / "src-tauri" / "src" / "hotkeys.rs").read_text(encoding="utf-8")
    assert "ButtonPress(Button::Middle)" not in hotkeys
    assert "ButtonRelease(Button::Middle)" not in hotkeys


def test_pill_uses_sidecar_audio_levels_without_opening_a_second_microphone_stream():
    pill = (ROOT / "src" / "components" / "Pill.tsx").read_text(encoding="utf-8")
    hook = (ROOT / "src" / "hooks" / "useSidecar.ts").read_text(encoding="utf-8")
    assert "navigator.mediaDevices.getUserMedia" not in pill
    assert 'case "audio_level"' in hook


def test_pill_waveform_amplifies_real_speech_and_wake_capture_emits_levels():
    pill = (ROOT / "src" / "components" / "Pill.tsx").read_text(encoding="utf-8")
    recorder = (ROOT / "sidecar" / "recorder.py").read_text(encoding="utf-8")
    assert "Math.sqrt(smoothLevel * 18)" in pill
    assert "const isActive = isRecording || level > 0.001;" in pill
    assert "if wf is not None or hf_queue is not None:" in recorder


def test_pill_smooths_audio_levels_locally_before_rendering_bars():
    pill = (ROOT / "src" / "components" / "Pill.tsx").read_text(encoding="utf-8")
    assert "function useSmoothedAudioLevel" in pill
    assert "requestAnimationFrame" in pill
    assert "const smoothLevel = useSmoothedAudioLevel" in pill


def test_pill_loading_state_is_an_amber_squiggle_with_hover_help_not_a_banner():
    pill = (ROOT / "src" / "components" / "Pill.tsx").read_text(encoding="utf-8")
    assert "Loading transcription model" not in pill
    assert 'state="loading"' in pill
    assert "Starting Parakeet" in pill


def test_pill_uses_a_continuous_waveform_instead_of_equalizer_bars():
    pill = (ROOT / "src" / "components" / "Pill.tsx").read_text(encoding="utf-8")
    assert "function buildWavePath" in pill
    assert "<path d={wavePath}" in pill
    assert "BAR_COUNT" not in pill


def test_sidecar_metadata_status_does_not_reset_the_live_audio_visual():
    hook = (ROOT / "src" / "hooks" / "useSidecar.ts").read_text(encoding="utf-8")
    assert 'const state = statusMap[msg.msg];' in hook
    assert 'statusMap[msg.msg] ?? "idle"' not in hook


def test_model_loading_status_cannot_demote_an_active_recording_visual():
    hook = (ROOT / "src" / "hooks" / "useSidecar.ts").read_text(encoding="utf-8")
    assert "const preserveActiveCapture" in hook
    assert 'state === "loading" || state === "idle"' in hook


def test_recording_controls_use_the_compact_action_style():
    pill = (ROOT / "src" / "components" / "Pill.tsx").read_text(encoding="utf-8")
    assert "recordAction" in pill
    assert "recordWavePill" in pill


def test_waveform_has_a_subtle_secondary_signal_layer():
    pill = (ROOT / "src" / "components" / "Pill.tsx").read_text(encoding="utf-8")
    assert "const echoWavePath" in pill
    assert "d={echoWavePath}" in pill
