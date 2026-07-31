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
    assert "edgeAction" in pill
    assert "recordWavePill" in pill


def test_compact_recording_pill_keeps_the_target_app_and_actions_inside_it():
    pill = (ROOT / "src" / "components" / "Pill.tsx").read_text(encoding="utf-8")
    assert "focusedApp?.iconDataUri" in pill
    assert "compact={true}" in pill
    assert "aria-label=\"Cancel dictation\"" in pill
    assert "aria-label=\"Finish dictation\"" in pill


def test_waveform_has_a_subtle_secondary_signal_layer():
    pill = (ROOT / "src" / "components" / "Pill.tsx").read_text(encoding="utf-8")
    assert "const echoWavePath" in pill
    assert "d={echoWavePath}" in pill


def test_recording_actions_expand_from_the_capsule_edges():
    pill = (ROOT / "src" / "components" / "Pill.tsx").read_text(encoding="utf-8")
    assert "edgeAction" in pill
    assert "edgeActionOpen" in pill
    assert 'hoveredEl === "cancel"' in pill
    assert 'hoveredEl === "finish"' in pill


def test_recording_edge_actions_follow_the_pill_contours():
    pill = (ROOT / "src" / "components" / "Pill.tsx").read_text(encoding="utf-8")
    assert 'borderRadius: "999px 8px 8px 999px"' in pill
    assert 'borderRadius: "8px 999px 999px 8px"' in pill


def test_recording_edge_actions_are_flush_with_the_capsule_surface():
    pill = (ROOT / "src" / "components" / "Pill.tsx").read_text(encoding="utf-8")
    assert "width: 18, height: 32" in pill
    assert 'height: 32, padding: 0, gap: 4' in pill


def test_recording_glyphs_share_an_optical_baseline():
    pill = (ROOT / "src" / "components" / "Pill.tsx").read_text(encoding="utf-8")
    assert 'transform: "translateX(-1px) translateY(0.5px)"' in pill


def test_loading_and_processing_share_the_same_cool_capsule():
    pill = (ROOT / "src" / "components" / "Pill.tsx").read_text(encoding="utf-8")
    assert "loadingPill:" in pill
    assert pill.count("s.loadingPill") >= 2


def test_recording_edge_glyphs_are_inset_and_themed_for_the_capsule():
    pill = (ROOT / "src" / "components" / "Pill.tsx").read_text(encoding="utf-8")
    assert 'transform: "translateX(1px)"' in pill
    assert 'transform: "translateX(-1px) translateY(0.5px)"' in pill
    assert 'stroke="rgba(248,113,113,0.92)"' in pill
    assert 'stroke="rgba(110,231,183,0.96)"' in pill


def test_waveform_keeps_inset_ends_and_more_room_in_compact_mode():
    pill = (ROOT / "src" / "components" / "Pill.tsx").read_text(encoding="utf-8")
    assert "const inset = 3" in pill
    assert "const width = 52" in pill
    assert "width={compact ? 50 : 58}" in pill


def test_idle_pill_drops_the_redundant_language_and_copy_controls():
    pill = (ROOT / "src" / "components" / "Pill.tsx").read_text(encoding="utf-8")
    assert "Change language" not in pill
    assert "Copy recent" not in pill
    assert "GlobeIcon" not in pill
    assert "NotesIcon" not in pill
    assert "Start dictation" in pill
    assert "shortcutKey" in pill


def test_loading_pill_keeps_the_target_app_icon_and_verba_palette():
    pill = (ROOT / "src" / "components" / "Pill.tsx").read_text(encoding="utf-8")
    assert "focusedApp?.iconDataUri" in pill
    assert "loadingPill" in pill
    assert 'rgba(129,140,248,0.96)' in pill
    assert 'rgba(251,191,36,0.42)' not in pill


def test_pill_states_share_a_settle_transition_instead_of_hard_swapping():
    pill = (ROOT / "src" / "components" / "Pill.tsx").read_text(encoding="utf-8")
    assert "@keyframes pillStateSettle" in pill
    assert "stateSurface" in pill
    assert "key={`pill-${recordingState}`}" in pill
    assert "background 220ms" in pill
