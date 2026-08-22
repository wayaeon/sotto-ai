from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_cleanup_module_targets_openrouter_with_env_key_fallback():
    source = (ROOT / "src/lib/llmCleanup.ts").read_text(encoding="utf-8")
    assert "https://openrouter.ai/api/v1/chat/completions" in source
    assert 'localStorage.getItem("verba_llm_enabled")' in source
    assert 'localStorage.getItem("verba_llm_api_key")' in source
    assert 'localStorage.getItem("verba_llm_model")' in source
    assert 'localStorage.getItem("verba_llm_prompt")' in source
    assert "VITE_OPENROUTER_API_KEY" in source
    assert "AbortController" in source
    assert "sk-or-" not in source


def test_cleanup_failure_falls_back_to_the_raw_transcript():
    source = (ROOT / "src/lib/llmCleanup.ts").read_text(encoding="utf-8")
    assert "return null" in source


def test_dictation_pipeline_applies_llm_cleanup_before_injection():
    hook = (ROOT / "src/hooks/useSidecar.ts").read_text(encoding="utf-8")
    assert "isLlmCleanupEnabled" in hook
    assert "cleanupTranscript" in hook
    assert hook.index("cleanupTranscript") < hook.index("injectText(finalText)")


def test_settings_ui_collects_an_openrouter_api_key_not_an_ollama_url():
    tab = (ROOT / "src/components/settings/LLMTab.tsx").read_text(encoding="utf-8")
    assert "verba_llm_api_key" in tab
    assert "OpenRouter" in tab
    assert "localhost:11434" not in tab


def test_no_real_api_key_is_committed_to_source():
    import re
    # Match the shape of a real OpenRouter key — placeholders like "sk-or-v1-…" are fine.
    real_key = re.compile(r"sk-or-v1-[A-Za-z0-9_-]{20,}")
    for relative in ["src/lib/llmCleanup.ts", "src/components/settings/LLMTab.tsx"]:
        source = (ROOT / relative).read_text(encoding="utf-8")
        assert not real_key.search(source), f"hardcoded API key found in {relative}"


def test_env_example_documents_the_browser_visible_key_name():
    example = (ROOT / ".env.example").read_text(encoding="utf-8")
    assert "VITE_OPENROUTER_API_KEY" in example
