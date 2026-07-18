from pathlib import Path


def test_pill_resizes_before_repositioning() -> None:
    source = (Path(__file__).parents[1] / "src" / "components" / "Pill.tsx").read_text()

    assert "await win.setSize(new PhysicalSize(widthPx, heightPx));" in source
    assert "await win.setPosition(new PhysicalPosition(x, y));" in source
    assert "Promise.all([" not in source
