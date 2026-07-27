from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_primary_injection_uses_the_local_context_formatter_with_the_start_target():
    hook = (ROOT / "src" / "hooks" / "useSidecar.ts").read_text(encoding="utf-8")

    assert 'from "../lib/contextFormatting"' in hook
    assert "const dictationTarget = useRef" in hook
    assert "const formatted = formatForContext(raw, resolveContextProfile(dictatedInto));" in hook
    assert "injectText(formatted)" in hook
