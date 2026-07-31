from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_transcript_store_supports_verbatim_history_and_deleting_items():
    source = (ROOT / "src/lib/db.ts").read_text(encoding="utf-8")
    assert "export function deleteTranscription(" in source
    assert "localStorage.setItem(TRANSCRIPTIONS_KEY" in source
    assert "updateTranscription" not in source


def test_library_has_real_transcript_actions_and_insights_has_one_range():
    source = (ROOT / "src/components/Home.tsx").read_text(encoding="utf-8")
    assert "deleteTranscription" in source
    detail = source[source.index("function HistoryScreen"):source.index("// ─── Activity Heatmap")]
    assert "Download" not in detail
    assert "Edit" not in detail
    assert 'const [range, setRange]' in source


def test_sidebar_keeps_the_icon_rail_fixed_while_labels_expand():
    source = (ROOT / "src/index.css").read_text(encoding="utf-8")
    assert ".sidebar .nav-item { justify-content: flex-start; padding: 9px 12px; }" in source
    assert ".sidebar:hover .nav-item" not in source


def test_library_uses_icon_app_filters_and_opens_details_only_on_selection():
    source = (ROOT / "src/components/Home.tsx").read_text(encoding="utf-8")
    assert "const [selected, setSelected] = useState<Transcription | null>(null);" in source
    assert "const contextFilters = useMemo(() => {" in source
    assert "apps.set(transcription.app_name, {" in source
    assert "count: (existing?.count ?? 0) + 1" in source
    assert "overflowX: \"auto\"" in source
    assert "history-app-rail" in source
    assert 'className={`history-layout${selected ? " has-detail" : ""}`}' in source
    assert "{selected && (" in source
