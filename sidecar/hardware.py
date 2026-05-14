"""Detect hardware capabilities and assign model tier."""
from __future__ import annotations

import platform
import shutil
import subprocess
from dataclasses import dataclass, field
from enum import Enum


class ModelTier(str, Enum):
    TIER1 = "tier1"        # whisper-large-v3-turbo, ≥16GB RAM, CPU
    TIER2 = "tier2"        # parakeet-tdt-1.1b, NVIDIA GPU ≥6GB VRAM
    TIER3_EN = "tier3_en"  # moonshine-base, 6-16GB RAM English only
    TIER3_ML = "tier3_ml"  # whisper-medium, 6-16GB RAM multilingual
    TIER4_CLOUD = "tier4"  # redirect to ElevenLabs cloud


MODEL_NAMES: dict[ModelTier, str] = {
    ModelTier.TIER1: "whisper-large-v3-turbo",
    ModelTier.TIER2: "parakeet-tdt-1.1b",
    ModelTier.TIER3_EN: "moonshine-base",
    ModelTier.TIER3_ML: "whisper-medium",
    ModelTier.TIER4_CLOUD: "cloud",
}


@dataclass
class HardwareInfo:
    ram_gb: float
    has_nvidia_cuda: bool
    nvidia_vram_gb: float
    free_disk_gb: float
    platform: str = field(default_factory=platform.system)
    tier: ModelTier = field(init=False)
    model_name: str = field(init=False)

    def __post_init__(self) -> None:
        self.tier = self._assign_tier()
        self.model_name = MODEL_NAMES[self.tier]

    def _assign_tier(self) -> ModelTier:
        if self.free_disk_gb < 1.0 or self.ram_gb < 6:
            return ModelTier.TIER4_CLOUD
        if self.has_nvidia_cuda and self.nvidia_vram_gb >= 6:
            return ModelTier.TIER2
        if self.ram_gb >= 16:
            return ModelTier.TIER1
        return ModelTier.TIER3_EN

    def to_dict(self) -> dict:
        return {
            "tier": self.tier.value,
            "model": self.model_name,
            "ram_gb": round(self.ram_gb, 1),
            "has_nvidia_cuda": self.has_nvidia_cuda,
            "nvidia_vram_gb": round(self.nvidia_vram_gb, 1),
            "free_disk_gb": round(self.free_disk_gb, 1),
            "platform": self.platform,
        }


def _get_ram_gb() -> float:
    try:
        import psutil
        return psutil.virtual_memory().total / (1024**3)
    except ImportError:
        pass
    if platform.system() == "Windows":
        try:
            result = subprocess.run(
                ["wmic", "computersystem", "get", "TotalPhysicalMemory"],
                capture_output=True, text=True, timeout=5
            )
            lines = result.stdout.strip().split("\n")
            if len(lines) >= 2:
                return int(lines[1].strip()) / (1024**3)
        except Exception:
            pass
    return 8.0  # safe default


def _get_nvidia_info() -> tuple[bool, float]:
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=memory.total", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            vram_mb = float(result.stdout.strip().split("\n")[0].strip())
            return True, vram_mb / 1024
    except Exception:
        pass
    return False, 0.0


def _get_free_disk_gb() -> float:
    try:
        total, used, free = shutil.disk_usage("/")
        return free / (1024**3)
    except Exception:
        return 10.0


def detect() -> HardwareInfo:
    ram = _get_ram_gb()
    has_cuda, vram = _get_nvidia_info()
    disk = _get_free_disk_gb()
    return HardwareInfo(
        ram_gb=ram,
        has_nvidia_cuda=has_cuda,
        nvidia_vram_gb=vram,
        free_disk_gb=disk,
    )
