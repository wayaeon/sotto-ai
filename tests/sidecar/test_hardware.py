import pytest
from sidecar import hardware
from sidecar.hardware import HardwareInfo, ModelTier


def _hw(ram_gb=32, has_cuda=False, vram=0, disk=100) -> HardwareInfo:
    return HardwareInfo(
        ram_gb=ram_gb,
        has_nvidia_cuda=has_cuda,
        nvidia_vram_gb=vram,
        free_disk_gb=disk,
    )


def test_cpu_high_ram_uses_parakeet_model():
    hw = _hw(ram_gb=32)
    assert hw.tier == ModelTier.TIER_CPU
    assert hw.model_name == "nvidia/parakeet-tdt-0.6b-v3"


def test_high_vram_nvidia_gpu_uses_cuda_high_parakeet():
    hw = _hw(ram_gb=16, has_cuda=True, vram=8)
    assert hw.tier == ModelTier.TIER_CUDA_HIGH
    assert hw.model_name == "nvidia/parakeet-tdt-0.6b-v3"


def test_cpu_medium_ram_uses_parakeet_model():
    hw = _hw(ram_gb=12)
    assert hw.tier == ModelTier.TIER_CPU
    assert hw.model_name == "nvidia/parakeet-tdt-0.6b-v3"


def test_tier4_low_ram():
    hw = _hw(ram_gb=4)
    assert hw.tier == ModelTier.TIER_CPU
    assert hw.model_name == "nvidia/parakeet-tdt-0.6b-v3"


def test_low_disk_falls_back_to_cpu_tier():
    hw = _hw(ram_gb=32, disk=0.4)
    assert hw.tier == ModelTier.TIER_CPU


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


_PNPUTIL_CPU_BRANDED_AI = """\
Instance ID:              ACPI\\AuthenticAMD_-_AMD64_Family_26_Model_96_-_AMD_Ryzen_AI_7_350
Device Description:       AMD Ryzen AI 7 350 w/ Radeon 860M
Class Name:                Processor

Instance ID:              PCI\\VEN_1022&DEV_17F0
Device Description:       NPU Compute Accelerator Device
Class Name:                ComputeAccelerator
"""


def test_cpu_branded_ryzen_ai_is_not_mistaken_for_npu(monkeypatch):
    """A CPU literally named "Ryzen AI" must not be counted as an AI accelerator
    device — only the real ComputeAccelerator-class NPU should be reported."""
    monkeypatch.setattr(hardware, "_run_command_text", lambda *a, **k: _PNPUTIL_CPU_BRANDED_AI)
    monkeypatch.setattr(hardware, "_run_powershell_json", lambda *a, **k: None)

    class _NoRows:
        stdout = ""

    monkeypatch.setattr(hardware.subprocess, "run", lambda *a, **k: _NoRows())

    found = hardware._get_ai_accelerators()
    assert found == ["NPU Compute Accelerator Device"]
