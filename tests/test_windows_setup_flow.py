from pathlib import Path


ROOT = Path(__file__).parents[1]


def test_setup_and_settings_use_the_shared_windows_shortcut():
    source = (ROOT / "src" / "lib" / "shortcuts.ts").read_text(encoding="utf-8")
    ready = (ROOT / "src" / "components" / "setup" / "ReadyScreen.tsx").read_text(encoding="utf-8")
    hotkeys = (ROOT / "src" / "components" / "settings" / "HotkeysTab.tsx").read_text(encoding="utf-8")
    assert 'pushToTalk: "Ctrl + Win"' in source
    assert "WINDOWS_SHORTCUTS" in ready
    assert "WINDOWS_SHORTCUTS" in hotkeys


def test_setup_wizard_uses_the_new_step_order():
    wizard = (ROOT / "src" / "components" / "setup" / "SetupWizard.tsx").read_text(encoding="utf-8")
    assert 'type Step = "permissions" | "model" | "tryit"' in wizard
    assert 'const STEPS: Step[] = ["permissions", "model", "tryit"]' in wizard
    assert "ModelStep" in wizard and "TryItStep" in wizard


def test_ready_event_does_not_send_a_competing_frontend_model_selection():
    hook = (ROOT / "src" / "hooks" / "useSidecar.ts").read_text(encoding="utf-8")
    ready_block = hook.split('case "ready":', 1)[1].split('case "word":', 1)[0]
    assert "setModelIpc(DEFAULT_MODEL)" not in ready_block
