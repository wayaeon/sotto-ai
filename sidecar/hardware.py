"""Detect hardware capabilities and assign model tier."""
from __future__ import annotations

import json
import os
import platform as platform_module
import re
import shutil
import subprocess
from dataclasses import dataclass, field
from enum import Enum


class ModelTier(str, Enum):
    TIER1 = "tier1"        # large-v3-turbo, ≥16GB RAM (or NVIDIA GPU ≥6GB VRAM)
    TIER2 = "tier2"        # large-v3-turbo via GPU
    TIER3_EN = "tier3_en"  # medium.en, 8-16GB RAM English-only
    TIER3_ML = "tier3_ml"  # medium, 8-16GB RAM multilingual
    TIER4_CLOUD = "tier4"  # small, <8GB RAM (still local — "cloud" tier name kept for compat)


# Model names must be exactly what faster-whisper / RealtimeSTT accepts:
# short IDs (auto-download from HF) or local CTranslate2 directory paths.
MODEL_NAMES: dict[ModelTier, str] = {
    ModelTier.TIER1:       "large-v3-turbo",  # ~3.1 GB
    ModelTier.TIER2:       "large-v3-turbo",  # same model, GPU accelerated
    ModelTier.TIER3_EN:    "medium.en",       # ~1.5 GB, English only
    ModelTier.TIER3_ML:    "medium",          # ~1.5 GB, multilingual
    ModelTier.TIER4_CLOUD: "small",           # ~460 MB, lowest RAM
}


@dataclass
class HardwareInfo:
    ram_gb: float
    has_nvidia_cuda: bool
    nvidia_vram_gb: float
    free_disk_gb: float
    cpu_name: str = "unknown"
    cpu_cores: int = 0
    cpu_threads: int = 0
    gpus: list[dict] = field(default_factory=list)
    ai_accelerators: list[str] = field(default_factory=list)
    detection_notes: list[str] = field(default_factory=list)
    platform: str = field(default_factory=platform_module.system)
    platform_release: str = field(default_factory=platform_module.release)
    machine: str = field(default_factory=platform_module.machine)
    tier: ModelTier = field(init=False)
    model_name: str = field(init=False)

    def __post_init__(self) -> None:
        self.tier = self._assign_tier()
        self.model_name = MODEL_NAMES[self.tier]

    def _assign_tier(self) -> ModelTier:
        if self.free_disk_gb < 0.5 or self.ram_gb < 4:
            return ModelTier.TIER4_CLOUD   # small model
        if self.has_nvidia_cuda and self.nvidia_vram_gb >= 6:
            return ModelTier.TIER2         # large-v3-turbo on GPU — fast
        # CPU-only: large-v3-turbo is unusably slow without a GPU.
        # Cap at medium.en regardless of RAM — it's the best CPU model.
        if self.ram_gb >= 8:
            return ModelTier.TIER3_EN      # medium.en, fast on CPU
        return ModelTier.TIER4_CLOUD       # small model

    def to_dict(self) -> dict:
        from .models import best_available_model
        actual_model = best_available_model(self.model_name)
        return {
            "tier": self.tier.value,
            "model": actual_model,          # what will actually be loaded
            "preferred_model": self.model_name,  # what tier recommends
            "ram_gb": round(self.ram_gb, 1),
            "has_nvidia_cuda": self.has_nvidia_cuda,
            "nvidia_vram_gb": round(self.nvidia_vram_gb, 1),
            "free_disk_gb": round(self.free_disk_gb, 1),
            "platform": self.platform,
            "platform_release": self.platform_release,
            "machine": self.machine,
            "cpu_name": self.cpu_name,
            "cpu_cores": self.cpu_cores,
            "cpu_threads": self.cpu_threads,
            "gpus": self.gpus,
            "has_amd_gpu": any("amd" in str(gpu.get("name", "")).lower() or "radeon" in str(gpu.get("name", "")).lower() for gpu in self.gpus),
            "has_intel_gpu": any("intel" in str(gpu.get("name", "")).lower() for gpu in self.gpus),
            "ai_accelerators": self.ai_accelerators,
            "detection_notes": self.detection_notes,
        }


def _get_ram_gb() -> float:
    try:
        import psutil
        return psutil.virtual_memory().total / (1024**3)
    except ImportError:
        pass
    if platform_module.system() == "Windows":
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


def _run_powershell_json(script: str):
    for exe in ("powershell", "pwsh"):
        try:
            result = subprocess.run(
                [
                    exe,
                    "-NoProfile",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-Command",
                    f"{script} | ConvertTo-Json -Depth 5 -Compress",
                ],
                capture_output=True,
                text=True,
                timeout=8,
            )
            output = result.stdout.strip()
            if result.returncode == 0 and output:
                return json.loads(output)
        except Exception:
            continue
    return None


def _run_command_text(args: list[str], timeout: int = 8) -> str:
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
        if result.returncode == 0:
            return result.stdout
    except Exception:
        pass
    return ""


def _read_windows_registry_value(path: str, name: str):
    if platform_module.system() != "Windows":
        return None
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, path) as key:
            value, _ = winreg.QueryValueEx(key, name)
            return value
    except Exception:
        return None


def _clean_device_name(name: str) -> str:
    return re.sub(r"\s+", " ", name.replace("\x00", " ")).strip()


def _looks_like_ai_accelerator(desc: str, instance: str = "") -> bool:
    desc_low = desc.lower()
    instance_low = instance.lower()
    npu_token = re.search(r"(^|[^a-z0-9])npu([^a-z0-9]|$)", desc_low) is not None
    desc_needles = ("neural", "ai accelerator", "ryzen ai", "xdna", "hexagon")
    instance_needles = ("ryzen_ai", "xdna", "neural")
    generic_device_terms = ("hid-compliant", "input", "touch screen", "pen", "system controller")
    desc_match = npu_token or any(needle in desc_low for needle in desc_needles)
    instance_match = any(needle in instance_low for needle in instance_needles)
    generic = any(term in desc_low for term in generic_device_terms)
    return bool(desc and (desc_match or (instance_match and not generic)))


def _parse_pnputil_blocks(output: str) -> list[dict[str, str]]:
    blocks: list[dict[str, str]] = []
    current: dict[str, str] = {}
    last_key = ""

    for raw_line in output.splitlines():
        line = raw_line.rstrip()
        if not line.strip():
            continue
        match = re.match(r"^([^:]+):\s*(.*)$", line)
        if match:
            key = match.group(1).strip()
            value = match.group(2).strip()
            if key == "Instance ID" and current:
                blocks.append(current)
                current = {}
            current[key] = value
            last_key = key
        elif current and last_key:
            current[last_key] = f"{current[last_key]} {line.strip()}".strip()

    if current:
        blocks.append(current)
    return blocks


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
        # Use home directory so this works on Windows (avoids "/" resolving wrong drive)
        import pathlib
        total, used, free = shutil.disk_usage(str(pathlib.Path.home()))
        return free / (1024**3)
    except Exception:
        return 10.0


def _get_cpu_info() -> tuple[str, int, int]:
    name = (
        platform_module.processor()
        or os.environ.get("PROCESSOR_IDENTIFIER")
        or os.environ.get("PROCESSOR_ARCHITECTURE")
        or "unknown"
    )
    cores = os.cpu_count() or 0
    threads = cores

    try:
        import psutil
        cores = psutil.cpu_count(logical=False) or 0
        threads = psutil.cpu_count(logical=True) or 0
    except Exception:
            pass

    if platform_module.system() == "Windows":
        reg_name = _read_windows_registry_value(
            r"HARDWARE\DESCRIPTION\System\CentralProcessor\0",
            "ProcessorNameString",
        )
        if isinstance(reg_name, str) and reg_name.strip():
            name = _clean_device_name(reg_name)

        # Some Ryzen AI systems expose the friendly marketing name through PnP,
        # while the processor registry only exposes family/model/stepping.
        pnp_cpu = _run_command_text(["pnputil", "/enum-devices", "/class", "Processor"], timeout=6)
        for device in _parse_pnputil_blocks(pnp_cpu):
            desc = _clean_device_name(device.get("Device Description", ""))
            if "ryzen ai" in desc.lower() or ("amd ryzen" in desc.lower() and len(desc) > len(name)):
                name = desc
                break

        ps_cpu = _run_powershell_json(
            "Get-CimInstance Win32_Processor | Select-Object -First 1 Name,NumberOfCores,NumberOfLogicalProcessors"
        )
        if isinstance(ps_cpu, dict):
            name = str(ps_cpu.get("Name") or name).strip() or name
            cores = int(ps_cpu.get("NumberOfCores") or cores or 0)
            threads = int(ps_cpu.get("NumberOfLogicalProcessors") or threads or 0)
            return name, cores, threads

        try:
            result = subprocess.run(
                ["wmic", "cpu", "get", "Name,NumberOfCores,NumberOfLogicalProcessors", "/format:csv"],
                capture_output=True, text=True, timeout=5
            )
            rows = [line.strip() for line in result.stdout.splitlines() if line.strip() and not line.startswith("Node,")]
            if rows:
                parts = rows[0].split(",")
                if len(parts) >= 4:
                    name = parts[1].strip() or name
                    cores = int(parts[2]) if parts[2].strip().isdigit() else cores
                    threads = int(parts[3]) if parts[3].strip().isdigit() else threads
        except Exception:
            pass

    return name, cores, threads


def _get_gpu_info() -> list[dict]:
    gpus: list[dict] = []
    if platform_module.system() == "Windows":
        pnp_display = _run_command_text(["pnputil", "/enum-devices", "/class", "Display"], timeout=8)
        for device in _parse_pnputil_blocks(pnp_display):
            name = _clean_device_name(device.get("Device Description", ""))
            if not name:
                continue
            gpu = {
                "name": name,
                "vram_gb": 0.0,
                "driver": _clean_device_name(device.get("Driver Name", "")),
                "manufacturer": _clean_device_name(device.get("Manufacturer Name", "")),
                "status": _clean_device_name(device.get("Status", "")),
                "source": "pnputil",
            }
            gpus.append(gpu)
        if gpus:
            return gpus

        ps_gpus = _run_powershell_json(
            "Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM,DriverVersion"
        )
        if isinstance(ps_gpus, dict):
            ps_gpus = [ps_gpus]
        if isinstance(ps_gpus, list):
            for gpu in ps_gpus:
                name = str(gpu.get("Name") or "").strip()
                if not name:
                    continue
                vram_gb = 0.0
                try:
                    raw = int(gpu.get("AdapterRAM") or 0)
                    vram_gb = raw / (1024**3) if raw > 0 else 0.0
                except Exception:
                    pass
                gpus.append({
                    "name": name,
                    "vram_gb": round(vram_gb, 1),
                    "driver": str(gpu.get("DriverVersion") or "").strip(),
                    "source": "cim",
                })
            if gpus:
                return gpus

        try:
            result = subprocess.run(
                ["wmic", "path", "win32_VideoController", "get", "Name,AdapterRAM", "/format:csv"],
                capture_output=True, text=True, timeout=5
            )
            for line in result.stdout.splitlines():
                line = line.strip()
                if not line or line.startswith("Node,"):
                    continue
                parts = line.split(",")
                if len(parts) < 3:
                    continue
                ram_raw = parts[1].strip()
                name = ",".join(parts[2:]).strip()
                vram_gb = 0.0
                try:
                    vram_gb = int(ram_raw) / (1024**3) if ram_raw else 0.0
                except Exception:
                    pass
                if name:
                    gpus.append({"name": name, "vram_gb": round(vram_gb, 1), "source": "wmic"})
        except Exception:
            pass

    if not gpus:
        has_cuda, vram = _get_nvidia_info()
        if has_cuda:
            gpus.append({"name": "NVIDIA CUDA GPU", "vram_gb": round(vram, 1), "source": "nvidia-smi"})

    return gpus


def _get_ai_accelerators() -> list[str]:
    found: list[str] = []
    if platform_module.system() != "Windows":
        return found

    pnp_all = _run_command_text(["pnputil", "/enum-devices"], timeout=12)
    for device in _parse_pnputil_blocks(pnp_all):
        desc = _clean_device_name(device.get("Device Description", ""))
        instance = _clean_device_name(device.get("Instance ID", ""))
        if _looks_like_ai_accelerator(desc, instance):
            found.append(desc)

    ps_devices = _run_powershell_json(
        "Get-PnpDevice | Where-Object { $_.FriendlyName -match 'NPU|Neural|AI|Ryzen AI|XDNA|Copilot|Hexagon' -or $_.Class -match 'Compute|Extension' } | Select-Object FriendlyName,Class,Status"
    )
    if isinstance(ps_devices, dict):
        ps_devices = [ps_devices]
    if isinstance(ps_devices, list):
        for device in ps_devices:
            name = str(device.get("FriendlyName") or "").strip()
            if _looks_like_ai_accelerator(name):
                found.append(name)

    try:
        result = subprocess.run(
            ["wmic", "path", "Win32_PnPEntity", "get", "Name", "/format:csv"],
            capture_output=True, text=True, timeout=8
        )
        for line in result.stdout.splitlines():
            name = line.split(",", 1)[-1].strip()
            if _looks_like_ai_accelerator(name):
                found.append(name)
    except Exception:
        pass

    return sorted(set(found))


def _build_detection_notes(gpus: list[dict], ai_accelerators: list[str]) -> list[str]:
    notes: list[str] = []
    gpu_sources = sorted({str(gpu.get("source", "")).strip() for gpu in gpus if gpu.get("source")})
    if gpu_sources:
        notes.append(f"gpu:{'/'.join(gpu_sources)}")
    if ai_accelerators:
        notes.append("ai:pnputil")
    if platform_module.system() == "Windows":
        notes.append("windows:wmi-fallback")
    return notes


def detect() -> HardwareInfo:
    ram = _get_ram_gb()
    has_cuda, vram = _get_nvidia_info()
    disk = _get_free_disk_gb()
    cpu_name, cpu_cores, cpu_threads = _get_cpu_info()
    gpus = _get_gpu_info()
    ai_accelerators = _get_ai_accelerators()
    detection_notes = _build_detection_notes(gpus, ai_accelerators)
    return HardwareInfo(
        ram_gb=ram,
        has_nvidia_cuda=has_cuda,
        nvidia_vram_gb=vram,
        free_disk_gb=disk,
        cpu_name=cpu_name,
        cpu_cores=cpu_cores,
        cpu_threads=cpu_threads,
        gpus=gpus,
        ai_accelerators=ai_accelerators,
        detection_notes=detection_notes,
    )
