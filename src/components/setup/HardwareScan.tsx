import { useEffect, useState } from "react";
import { useAppStore } from "../../stores/appStore";
import { detectHardware } from "../../lib/tauri";

interface Spec { key: string; label: string; value: string; detail: string }

function detect(): Spec[] {
  const cores = navigator.hardwareConcurrency ?? 4;
  const ramGb: number = (navigator as any).deviceMemory ?? 4;

  let gpu = "Integrated Graphics";
  try {
    const gl = document.createElement("canvas").getContext("webgl") as WebGLRenderingContext | null;
    if (gl) {
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      if (ext) {
        const raw = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string;
        gpu = raw.replace(/\(.*?\)/g, "").replace(/OpenGL.*/i, "").trim().slice(0, 38) || gpu;
      }
    }
  } catch {}

  return [
    {
      key: "ram",
      label: "Memory",
      value: `${ramGb} GB RAM`,
      detail: ramGb >= 32 ? "Ample — full local models" : ramGb >= 16 ? "Good — large models" : ramGb >= 8 ? "Sufficient — balanced models" : "Limited — cloud recommended",
    },
    {
      key: "cpu",
      label: "Processor",
      value: `${cores}-core CPU`,
      detail: cores >= 16 ? "High throughput" : cores >= 8 ? "Strong parallel processing" : "Adequate for real-time STT",
    },
    {
      key: "gpu",
      label: "Graphics",
      value: gpu,
      detail: gpu.toLowerCase().includes("nvidia") || gpu.toLowerCase().includes("rtx") || gpu.toLowerCase().includes("gtx")
        ? "CUDA acceleration available"
        : gpu.toLowerCase().includes("amd") || gpu.toLowerCase().includes("radeon")
        ? "ROCm may be available"
        : "CPU inference will be used",
    },
    {
      key: "tier",
      label: "Selected Model",
      value: ramGb >= 16 ? "whisper-large-v3-turbo" : ramGb >= 8 ? "moonshine-base" : "ElevenLabs Scribe",
      detail: ramGb >= 16 ? "Best accuracy · runs fully offline" : ramGb >= 8 ? "Fast & efficient · offline" : "Cloud-powered · API key required",
    },
  ];
}

function pickTier(ramGb: number) {
  if (ramGb >= 16) return { label: "High Performance", color: "#22c55e" };
  if (ramGb >= 8)  return { label: "Balanced", color: "#f59e0b" };
  return                  { label: "Cloud Mode", color: "#ef4444" };
}

interface Props { onNext: () => void }

export default function HardwareScan({ onNext }: Props) {
  const [specs]          = useState<Spec[]>(() => detect());
  const [revealed, setRevealed] = useState(0);
  const [done, setDone]  = useState(false);
  const { setTier, setModel } = useAppStore();

  const ramGb: number = (navigator as any).deviceMemory ?? 4;
  const tier = pickTier(ramGb);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    specs.forEach((_, i) =>
      timers.push(setTimeout(() => setRevealed(i + 1), 300 + i * 550))
    );
    timers.push(setTimeout(() => {
      setDone(true);
      let t: string, m: string;
      if (ramGb >= 16)      { t = "tier1";    m = "whisper-large-v3-turbo"; }
      else if (ramGb >= 8)  { t = "tier3_en"; m = "moonshine-base"; }
      else                  { t = "tier4";    m = "ElevenLabs Scribe v2"; }
      setTier(t as any); setModel(m);
      localStorage.setItem("sotto_tier", t);
      localStorage.setItem("sotto_model", m);
      // Tell the sidecar to detect hardware so it initializes the recorder
      detectHardware().catch(() => {});
    }, 300 + specs.length * 550 + 100));
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div style={s.root}>
      <style>{`
        @keyframes rowIn {
          from { opacity: 0; transform: translateX(-12px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes barGrow {
          from { width: 0%; }
          to   { width: 100%; }
        }
        @keyframes resultIn {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div style={s.eyebrow}>System Analysis</div>
      <h2 style={s.heading}>Detecting your hardware</h2>
      <p style={s.sub}>Sotto selects the optimal AI model for your machine.</p>

      <div style={s.list}>
        {specs.map((spec, i) => {
          const visible  = i < revealed;
          const active   = i === revealed - 1 && !done;
          return (
            <div
              key={spec.key}
              style={{
                ...s.row,
                opacity: visible ? 1 : 0,
                animation: visible ? "rowIn 0.35s ease forwards" : "none",
              }}
            >
              <div style={s.rowLeft}>
                <div style={s.rowLabel}>{spec.label}</div>
                <div style={s.rowValue}>{visible ? spec.value : ""}</div>
              </div>
              <div style={s.rowRight}>
                {visible && <div style={s.rowDetail}>{spec.detail}</div>}
              </div>
              <div style={s.bar}>
                {visible && (
                  <div
                    style={{
                      ...s.barFill,
                      animation: active ? "barGrow 0.5s ease forwards" : "none",
                      width: active ? undefined : "100%",
                    }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {done && (
        <div style={{ animation: "resultIn 0.4s ease forwards", ...s.result }}>
          <div style={s.resultLeft}>
            <span style={{ ...s.badge, color: tier.color, background: tier.color + "18" }}>
              {tier.label}
            </span>
            <span style={s.resultSub}>Your system is ready for local AI dictation.</span>
          </div>
          <button style={s.btn} onClick={onNext}>Continue</button>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  root: { width: "100%", maxWidth: 480 },
  eyebrow: { color: "#6366f1", fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 },
  heading: { color: "#fff", fontSize: 24, fontWeight: 700, margin: "0 0 6px", lineHeight: 1.2 },
  sub: { color: "rgba(255,255,255,0.35)", fontSize: 13, margin: "0 0 28px" },

  list: { display: "flex", flexDirection: "column", gap: 0 },
  row: {
    padding: "14px 0",
    borderBottom: "1px solid rgba(255,255,255,0.05)",
    position: "relative",
    overflow: "hidden",
  },
  rowLeft: { display: "flex", alignItems: "baseline", gap: 12, marginBottom: 4 },
  rowLabel: { color: "rgba(255,255,255,0.35)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8, minWidth: 72 },
  rowValue: { color: "#fff", fontSize: 14, fontWeight: 600 },
  rowRight: { paddingLeft: 84 },
  rowDetail: { color: "rgba(255,255,255,0.4)", fontSize: 12 },
  bar: { position: "absolute", bottom: 0, left: 0, right: 0, height: 1, background: "transparent" },
  barFill: { height: "100%", background: "linear-gradient(90deg, #6366f1, #a78bfa)" },

  result: {
    marginTop: 24,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    padding: "16px 20px",
    background: "rgba(99,102,241,0.08)",
    border: "1px solid rgba(99,102,241,0.2)",
    borderRadius: 12,
  },
  resultLeft: { display: "flex", flexDirection: "column", gap: 4 },
  badge: { display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700 },
  resultSub: { color: "rgba(255,255,255,0.35)", fontSize: 12 },
  btn: {
    flexShrink: 0,
    background: "#6366f1", color: "#fff", border: "none", borderRadius: 8,
    padding: "9px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer",
    whiteSpace: "nowrap",
  },
};
