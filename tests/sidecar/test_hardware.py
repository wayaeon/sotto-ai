import pytest
from sidecar.hardware import HardwareInfo, ModelTier


def _hw(ram_gb=32, has_cuda=False, vram=0, disk=100) -> HardwareInfo:
    return HardwareInfo(
        ram_gb=ram_gb,
        has_nvidia_cuda=has_cuda,
        nvidia_vram_gb=vram,
        free_disk_gb=disk,
    )


def test_cpu_high_ram_uses_small_model():
    hw = _hw(ram_gb=32)
    assert hw.tier == ModelTier.TIER_CPU
    assert hw.model_name == "small"


def test_high_vram_nvidia_gpu_uses_cuda_high_parakeet():
    hw = _hw(ram_gb=16, has_cuda=True, vram=8)
    assert hw.tier == ModelTier.TIER_CUDA_HIGH
    assert hw.model_name == "nvidia/parakeet-tdt-0.6b-v3"


def test_cpu_medium_ram_uses_small_model():
    hw = _hw(ram_gb=12)
    assert hw.tier == ModelTier.TIER_CPU
    assert hw.model_name == "small"


def test_tier4_low_ram():
    hw = _hw(ram_gb=4)
    assert hw.tier == ModelTier.TIER_CPU
    assert hw.model_name == "small"


def test_tier4_low_disk():
    hw = _hw(ram_gb=32, disk=0.4)
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
    assert hw.tier == ModelTier.TIER_CUDA_HIGH
