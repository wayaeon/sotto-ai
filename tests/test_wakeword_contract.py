from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_wakeword_detector_is_local_and_uses_the_fixed_phrase():
    source = (ROOT / "sidecar/wakeword.py").read_text(encoding="utf-8")
    assert 'WAKE_PHRASE = "VERBA DICTATE"' in source
    assert 'WAKE_PHRASE_VARIANTS = ("VERBA DICTATE", "VERB DICTATE")' in source
    assert "sherpa_onnx.KeywordSpotter" in source
    assert "num_threads=1" in source
    assert "keywords_threshold=0.20" in source
    assert ":2.0 #0.20 @VERBA_DICTATE" in source
    assert "faster_whisper" not in source
    assert "onnx_asr" not in source


def test_wakeword_model_readiness_requires_all_runtime_files():
    source = (ROOT / "sidecar/models.py").read_text(encoding="utf-8")
    assert "def wake_word_model_ready()" in source
    assert "tokens.txt" in source
    assert "keywords.txt" in source
    assert "encoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx" in source


def test_recorder_keeps_wake_phrase_out_of_the_transcribed_audio():
    source = (ROOT / "sidecar/recorder.py").read_text(encoding="utf-8")
    assert 'self._wake_mode = "off"' in source
    assert "def set_wake_phrase_enabled(self, enabled: bool) -> bool:" in source
    assert 'msg="wake_detected"' in source
    assert "wake_phrase_buf.clear()" in source
    assert 'msg="wake_armed"' in source
    assert "trailing_silence_frames" in source
    assert "wake_phrase_buf and detector is not None" in source


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
    assert "Verba, dictate" in home
    hook = (ROOT / "src/hooks/useSidecar.ts").read_text(encoding="utf-8")
    assert 'wake_dictating: "recording"' in hook
    assert 'msg.msg === "wake_armed"' in hook
    sidecar = (ROOT / "src-tauri/src/sidecar.rs").read_text(encoding="utf-8")
    assert 'line.contains("wake_dictating")' in sidecar
