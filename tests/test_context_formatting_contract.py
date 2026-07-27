from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_primary_injection_uses_the_local_context_formatter_with_the_start_target():
    hook = (ROOT / "src" / "hooks" / "useSidecar.ts").read_text(encoding="utf-8")

    assert 'from "../lib/contextFormatting"' in hook
    assert "const dictationTarget = useRef" in hook
    assert "const profile = resolveContextProfile(dictatedInto, context);" in hook
    assert "const formatted = formatForContext(raw, profile);" in hook
    assert "updateTranscription(entryId, polished)" in hook
    assert "injectText(finalText)" in hook


def test_primary_dictation_is_inserted_before_optional_cloud_polish():
    hook = (ROOT / "src" / "hooks" / "useSidecar.ts").read_text(encoding="utf-8")

    assert "finish(formatted);\n\n          void cloudFormat({" in hook
