from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_wakeword_detector_is_local_and_uses_the_fixed_phrase():
    source = (ROOT / "sidecar/wakeword.py").read_text(encoding="utf-8")
    assert 'WAKE_PHRASE = "VERBA DICTATE"' in source
    assert 'WAKE_PHRASE_VARIANTS = ("VERBA DICTATE",)' in source
    assert "sherpa_onnx.KeywordSpotter" in source
    assert "num_threads=1" in source
    assert "keywords_threshold=0.20" in source
    assert ":2.0 #0.20 @VERBA_DICTATE" in source
    assert "faster_whisper" not in source
    assert "onnx_asr" not in source


def test_windows_uses_the_local_model_listener():
    recorder = (ROOT / "sidecar/recorder.py").read_text(encoding="utf-8")
    assert "WakeWordDetector" in recorder
    assert "if sys.platform == \"win32\"" not in recorder
    assert "WindowsWakePhraseListener" not in recorder
    assert "_wake_phrase_loop" in recorder


def test_wakeword_model_readiness_requires_all_runtime_files():
    source = (ROOT / "sidecar/models.py").read_text(encoding="utf-8")
    assert "def wake_word_model_ready()" in source
    assert "tokens.txt" in source
    required_files = source[source.index("_WAKE_WORD_FILES ="):source.index("_WAKE_WORD_DOWNLOAD_LOCK")]
    assert '"keywords.txt"' not in required_files
    assert "encoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx" in source


def test_wakeword_keeps_generated_keywords_outside_the_model_package():
    models = (ROOT / "sidecar/models.py").read_text(encoding="utf-8")
    source = (ROOT / "sidecar/wakeword.py").read_text(encoding="utf-8")
    assert 'WAKE_WORD_KEYWORDS_FILE = _DATA_DIR / "wake" / "keywords.txt"' in models
    assert "WAKE_WORD_KEYWORDS_FILE" in source
    assert '(model_dir / "keywords.txt").write_text' not in source


def test_recorder_keeps_wake_phrase_out_of_the_transcribed_audio():
    source = (ROOT / "sidecar/recorder.py").read_text(encoding="utf-8")
    assert 'self._wake_mode = "off"' in source
    assert "def set_wake_phrase_enabled(self, enabled: bool) -> bool:" in source
    assert 'msg="wake_detected"' in source
    assert 'msg="wake_listening"' in source
    assert "wake_phrase_buf.clear()" in source
    assert 'msg="wake_armed"' in source
    assert "trailing_silence_frames" in source
    assert "wake_phrase_buf and detector is not None" in source


def test_handsfree_arms_only_through_the_deliberate_hotkey_toggle():
    recorder = (ROOT / "sidecar/recorder.py").read_text(encoding="utf-8")
    # Accidental UI triggers stay impossible.
    orb = (ROOT / "src/components/Orb.tsx").read_text(encoding="utf-8")
    pill = (ROOT / "src/components/Pill.tsx").read_text(encoding="utf-8")
    assert "toggleHandsfree" not in orb
    assert "toggleHandsfree" not in pill
    # Ctrl+Alt+Space arms real VAD segmentation and announces it to the UI.
    assert "target=self._handsfree_loop" in recorder
    assert 'msg="handsfree_on"' in recorder
    toggle = recorder[recorder.index("def toggle_handsfree"):recorder.index("def set_wake_phrase_enabled")]
    assert "_force_handsfree_off()" in toggle


def test_handsfree_utterances_are_guarded_before_a_wav_is_written():
    recorder = (ROOT / "sidecar/recorder.py").read_text(encoding="utf-8")
    start = recorder.index("def _transcribe_handsfree_utterance")
    body = recorder[start:recorder.index("def set_model")]
    guard = body.index("self._transcription_active")
    wav = body.index("wave.open")
    assert guard < wav


def test_starting_ptt_disarms_handsfree_so_capture_paths_stay_exclusive():
    recorder = (ROOT / "sidecar/recorder.py").read_text(encoding="utf-8")
    start = recorder.index("def start_ptt")
    body = recorder[start:recorder.index("def stop_ptt")]
    assert "_force_handsfree_off()" in body


def test_ctrl_alt_space_toggles_handsfree_on_windows_without_touching_ptt():
    hotkeys = (ROOT / "src-tauri/src/hotkeys.rs").read_text(encoding="utf-8")
    assert "KeyPress(Space)" in hotkeys
    assert '"cmd": "toggle_handsfree"' in hotkeys


def test_wake_phrase_has_a_real_ipc_and_settings_bridge():
    ipc = (ROOT / "sidecar/ipc.py").read_text(encoding="utf-8")
    main = (ROOT / "sidecar/main.py").read_text(encoding="utf-8")
    rust = (ROOT / "src-tauri/src/commands.rs").read_text(encoding="utf-8")
    tauri = (ROOT / "src/lib/tauri.ts").read_text(encoding="utf-8")
    home = (ROOT / "src/components/Home.tsx").read_text(encoding="utf-8")
    assert 'SET_WAKE_PHRASE_ENABLED = "set_wake_phrase_enabled"' in ipc
    assert "recorder.set_wake_phrase_enabled" in main
    assert "pub fn set_wake_phrase_enabled" in rust
    assert 'invoke("set_wake_phrase_enabled", { enabled })' in tauri
    assert "setWakePhraseEnabled" in home
    assert "Wake phrase" in home
    assert "Verba dictate" in home
    hook = (ROOT / "src/hooks/useSidecar.ts").read_text(encoding="utf-8")
    assert 'wake_dictating: "recording"' in hook
    assert 'wake_listening' in hook
    assert 'wake_armed: "armed"' in hook
    sidecar = (ROOT / "src-tauri/src/sidecar.rs").read_text(encoding="utf-8")
    assert 'line.contains("wake_dictating")' in sidecar
