from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_first_run_parakeet_download_has_real_progress_instead_of_generic_warming():
    hook = (ROOT / "src" / "hooks" / "useSidecar.ts").read_text(encoding="utf-8")
    store = (ROOT / "src" / "stores" / "appStore.ts").read_text(encoding="utf-8")
    step = (ROOT / "src" / "components" / "setup" / "ModelStep.tsx").read_text(encoding="utf-8")

    assert 'case "download_progress"' in hook
    assert "setModelDownload" in hook
    assert "modelDownload" in store
    assert "Downloading Parakeet" in step
    assert "downloadedLabel" in step
