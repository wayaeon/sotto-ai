from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_windows_does_not_preload_parakeet_at_sidecar_startup():
    main = (ROOT / "sidecar/main.py").read_text(encoding="utf-8")
    assert "recorder.warmup" not in main


def test_first_dictation_preloads_and_idle_evicts_the_model_worker():
    source = (ROOT / "sidecar/recorder.py").read_text(encoding="utf-8")
    assert "def preload_worker" in source
    assert "def schedule_worker_idle_unload" in source
    assert "_WORKER_IDLE_UNLOAD_S" in source
    start = source[source.index("def start_ptt"):source.index("def stop_ptt")]
    assert "self.preload_worker()" in start
    assert "self.schedule_worker_idle_unload()" in source[source.index("def _fetch_transcription"):]
    assert "_WORKER_IDLE_UNLOAD_S = 10 * 60" in source


def test_model_switch_does_not_eagerly_reload_parakeet():
    source = (ROOT / "sidecar/recorder.py").read_text(encoding="utf-8")
    model_switch = source[source.index("def set_model"):source.index("def set_dictionary")]
    assert "self._start_worker()" not in model_switch
