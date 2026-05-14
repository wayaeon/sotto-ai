import pytest
from sidecar.hardware import HardwareInfo, ModelTier


def _hw(ram_gb=32, has_cuda=False, vram=0, disk=100) -> HardwareInfo:
    return HardwareInfo(
        ram_gb=ram_gb,
        has_nvidia_cuda=has_cuda,
        nvidia_vram_gb=vram,
        free_disk_gb=disk,
    )


def test_tier1_high_ram_no_gpu():
    hw = _hw(ram_gb=32)
    assert hw.tier == ModelTier.TIER1
    assert hw.model_name == "whisper-large-v3-turbo"


def test_tier2_nvidia_gpu():
    hw = _hw(ram_gb=16, has_cuda=True, vram=8)
    assert hw.tier == ModelTier.TIER2
    assert hw.model_name == "parakeet-tdt-1.1b"


def test_tier3_medium_ram():
    hw = _hw(ram_gb=12)
    assert hw.tier == ModelTier.TIER3_EN
    assert hw.model_name == "moonshine-base"


def test_tier4_low_ram():
    hw = _hw(ram_gb=4)
    assert hw.tier == ModelTier.TIER4_CLOUD
    assert hw.model_name == "cloud"


def test_tier4_low_disk():
    hw = _hw(ram_gb=32, disk=0.5)
    assert hw.tier == ModelTier.TIER4_CLOUD


def test_to_dict_has_required_keys():
    hw = _hw()
    d = hw.to_dict()
    assert "tier" in d
    assert "model" in d
    assert "ram_gb" in d
    assert "platform" in d


def test_nvidia_wins_over_high_ram():
    hw = _hw(ram_gb=32, has_cuda=True, vram=8)
    assert hw.tier == ModelTier.TIER2
