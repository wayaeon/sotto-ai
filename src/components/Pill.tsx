import React, { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../stores/appStore";
import { useSidecar } from "../hooks/useSidecar";

const LANGUAGES = [
  { code: "EN", label: "English",            flag: "🇺🇸" },
  { code: "ES", label: "Spanish (Español)",  flag: "🇪🇸" },
  { code: "FR", label: "French (Français)",  flag: "🇫🇷" },
  { code: "DE", label: "German (Deutsch)",   flag: "🇩🇪" },
  { code: "JA", label: "Japanese (日本語)", flag: "🇯🇵" },
  { code: "ZH", label: "Chinese (中文)",    flag: "🇨🇳" },
  { code: "PT", label: "Portuguese",         flag: "🇧🇷" },
  { code: "IT", label: "Italian (Italiano)", flag: "🇮🇹" },
];

// Right side = wand(32) + gap(5) + notes(32) = 69px.
// Left side must match so wavepill lands at exact center.
const SIDE_W = 69;

type Hovered = null | "lang" | "dictate" | "enhance" | "history";

export default function Pill() {
  useSidecar();
  const { recordingState, sidecarReady, setRecordingState } = useAppStore();
  const pttActive  = useRef(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [bottomPad,     setBottomPad]     = useState(52); // updated on mount from real taskbar height
  const [expanded,      setExpanded]      = useState(false);
  const [hoveredEl,     setHoveredEl]     = useState<Hovered>(null);
  const [langIdx,       setLangIdx]       = useState(-1); // -1 = ALL (globe)
  const [showLangPanel, setShowLangPanel] = useState(false);
  const [activeLangs,   setActiveLangs]   = useState<Set<string>>(new Set(["EN", "ES"]));

  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background            = "transparent";
    const root = document.getElementById("root");
    if (root) root.style.background = "transparent";
    // Compute real taskbar height from screen vs available area, add 4px margin
    const taskbarH = window.screen.height - window.screen.availHeight;
    setBottomPad(Math.max(8, taskbarH + 10));
  }, []);

  // Keyboard shortcuts: Ctrl+Win = PTT (hold), Ctrl+Win+Space = hands-free toggle.
  // These fire when the pill window has focus; the global Rust hotkeys cover other apps.
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey || !e.metaKey) return;
      if (e.code === "Space") {
        e.preventDefault();
        if (!e.repeat) invoke("toggle_handsfree").catch(() => {});
        return;
      }
      // Ctrl+Win pressed (MetaLeft/MetaRight is the Win key itself)
      if ((e.code === "MetaLeft" || e.code === "MetaRight") && !e.repeat) {
        e.preventDefault();
        startPtt();
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code === "MetaLeft" || e.code === "MetaRight" || e.code === "ControlLeft" || e.code === "ControlRight") {
        stopPtt();
      }
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup",   onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup",   onUp);
    };
  }, [sidecarReady]); // re-bind when sidecarReady changes so startPtt/stopPtt see current state

  const isRecording  = recordingState === "recording";
  const isProcessing = recordingState === "processing";
  const visible      = expanded || isRecording || isProcessing;
  const allActive    = langIdx === -1;

  const scheduleHide = () => {
    leaveTimer.current = setTimeout(() => {
      setExpanded(false);
      setHoveredEl(null);
      setShowLangPanel(false);
    }, 150);
  };
  const cancelHide = () => clearTimeout(leaveTimer.current);

  const startPtt = async () => {
    if (pttActive.current) return;
    pttActive.current = true;
    setRecordingState("recording");
    if (sidecarReady) await invoke("start_ptt").catch(() => {});
  };
  const stopPtt = async () => {
    if (!pttActive.current) return;
    pttActive.current = false;
    setRecordingState("idle");
    if (sidecarReady) await invoke("stop_ptt").catch(() => {});
  };
  const cancelRecording = async () => {
    pttActive.current = false;
    setRecordingState("idle");
    if (sidecarReady) await invoke("stop_ptt").catch(() => {});
  };
  const copyRecent = async () => {
    const text = localStorage.getItem("sotto_last_transcription") ?? "";
    if (text) navigator.clipboard.writeText(text).catch(() => {});
  };

  const cycleLang = () => {
    const active = LANGUAGES.filter(l => activeLangs.has(l.code));
    if (active.length === 0) return;
    if (langIdx === -1) {
      // ALL → first active language
      setLangIdx(LANGUAGES.findIndex(l => l.code === active[0].code));
    } else {
      const cur = LANGUAGES[langIdx].code;
      const idx = active.findIndex(l => l.code === cur);
      if (idx === active.length - 1) {
        // last language → back to ALL
        setLangIdx(-1);
      } else {
        const next = active[idx + 1];
        setLangIdx(LANGUAGES.findIndex(l => l.code === next.code));
      }
    }
  };

  const toggleLang = (code: string) => {
    setActiveLangs(prev => {
      const next = new Set(prev);
      if (next.has(code) && next.size > 1) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  return (
    <div style={{ ...s.root, paddingBottom: bottomPad }}>
      <style>{`
        * { cursor: default !important; }

        @keyframes waveBar {
          0%, 100% { transform: scaleY(0.3); opacity: 0.4; }
          50%       { transform: scaleY(1);   opacity: 1; }
        }
        @keyframes dotPulse {
          0%, 100% { opacity: 0.2; }
          50%       { opacity: 0.85; }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateX(-50%) translateY(4px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes expandIn {
          from { opacity: 0; transform: translateY(4px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0)   scale(1); }
        }
        @keyframes panelIn {
          from { opacity: 0; transform: translateX(-50%) translateY(5px) scale(0.97); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0)    scale(1); }
        }
        /* Drawer wipes out from right-to-left (slides from under globe) */
        @keyframes drawerWipe {
          from { clip-path: inset(0 0 0 100%); }
          to   { clip-path: inset(0 0 0 0%); }
        }
        /* Language label pops in */
        @keyframes langPop {
          0%   { opacity: 0; transform: scale(0.65); }
          60%  { transform: scale(1.08); }
          100% { opacity: 1; transform: scale(1); }
        }

        .pbtn { outline: none; border: none; }
        .pbtn:active { transform: scale(0.9); }
      `}</style>

      {/* Collapsed handle — centered naturally by root flex */}
      <div
        style={{
          ...s.handle,
          opacity:       visible ? 0 : 1,
          pointerEvents: visible ? "none" : "auto",
          transition: "opacity 0.18s ease",
        }}
        onMouseEnter={() => { cancelHide(); setExpanded(true); }}
        onMouseLeave={scheduleHide}
      />

      {/* Expanded bar */}
      {visible && (
        <div style={s.barRow} onMouseEnter={cancelHide} onMouseLeave={scheduleHide}>

          {isRecording || isProcessing ? (
            // Recording: X — wave — ✓  (symmetric → wavepill stays centered)
            <>
              <div style={{ width: SIDE_W, display: "flex", justifyContent: "flex-end" }}>
                <button className="pbtn" style={{ ...s.iconBtn, border: "1px solid rgba(239,68,68,0.4)" }} onClick={cancelRecording}>
                  <XIcon />
                </button>
              </div>
              <div style={s.wavePill}>
                <WaveVisual state={recordingState} />
              </div>
              <div style={{ width: SIDE_W, display: "flex", justifyContent: "flex-start" }}>
                <button className="pbtn" style={{ ...s.iconBtn, border: "1px solid rgba(34,197,94,0.4)" }} onClick={stopPtt}>
                  <CheckIcon />
                </button>
              </div>
            </>
          ) : (
            <>
              {/* LEFT side (SIDE_W wide) — globe button right-aligned, drawer slides out left */}
              <div style={{ width: SIDE_W, display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
                <div
                  style={{ position: "relative", display: "inline-flex", alignItems: "center" }}
                  onMouseEnter={() => setHoveredEl("lang")}
                  onMouseLeave={() => setHoveredEl(null)}
                >
                  {/* Tooltip above globe */}
                  {hoveredEl === "lang" && !showLangPanel && (
                    <div style={s.tooltip}>
                      <span style={s.tooltipText}>Change language</span>
                    </div>
                  )}

                  {/* Drawer — absolutely positioned, slides left from under the globe */}
                  {hoveredEl === "lang" && (
                    <button
                      className="pbtn"
                      style={s.arrowDrawer}
                      onClick={() => setShowLangPanel(p => !p)}
                    >
                      <ChevronIcon />
                    </button>
                  )}

                  {/* Globe / lang button — sits on top of drawer */}
                  <button
                    className="pbtn"
                    style={{ ...s.iconBtn, position: "relative", zIndex: 1 }}
                    onClick={cycleLang}
                  >
                    {allActive
                      ? <GlobeIcon key="all" />
                      : <span key={langIdx} style={s.langCode}>{LANGUAGES[langIdx].code}</span>
                    }
                  </button>

                  {/* Language panel */}
                  {showLangPanel && (
                    <div style={s.langPanel} onMouseEnter={cancelHide}>
                      {LANGUAGES.map(lang => (
                        <button
                          key={lang.code}
                          className="pbtn"
                          style={s.langRow}
                          onClick={() => toggleLang(lang.code)}
                        >
                          <span style={s.langRowFlag}>{lang.flag}</span>
                          <span style={s.langRowLabel}>{lang.label}</span>
                          {activeLangs.has(lang.code) && <LangCheck />}
                        </button>
                      ))}
                      <div style={s.langDivider} />
                      <button
                        className="pbtn"
                        style={s.langAction}
                        onClick={() => setActiveLangs(new Set(LANGUAGES.map(l => l.code)))}
                      >
                        Enable all
                      </button>
                      <button className="pbtn" style={s.langAction}>Add more</button>
                    </div>
                  )}
                </div>
              </div>

              {/* CENTER — dictate wavepill */}
              <div
                style={{ position: "relative" }}
                onMouseEnter={() => setHoveredEl("dictate")}
                onMouseLeave={() => setHoveredEl(null)}
              >
                {hoveredEl === "dictate" && (
                  <div style={s.tooltip}>
                    <span style={s.tooltipText}>Dictate</span>
                    <span style={{ ...s.tooltipText, color: "#a78bfa", fontWeight: 600 }}>Ctrl+Win</span>
                  </div>
                )}
                <button className="pbtn" style={s.wavePill} onClick={startPtt}>
                  <WaveVisual state={recordingState} />
                </button>
              </div>

              {/* RIGHT side (SIDE_W wide) — wand + notes */}
              <div style={{ width: SIDE_W, display: "flex", gap: 5, alignItems: "center" }}>
                <div
                  style={{ position: "relative" }}
                  onMouseEnter={() => setHoveredEl("enhance")}
                  onMouseLeave={() => setHoveredEl(null)}
                >
                  {hoveredEl === "enhance" && (
                    <div style={s.tooltip}>
                      <span style={s.tooltipText}>Enhance</span>
                    </div>
                  )}
                  <button className="pbtn" style={s.iconBtn}>
                    <WandIcon />
                  </button>
                </div>
                <div
                  style={{ position: "relative" }}
                  onMouseEnter={() => setHoveredEl("history")}
                  onMouseLeave={() => setHoveredEl(null)}
                >
                  {hoveredEl === "history" && (
                    <div style={s.tooltip}>
                      <span style={s.tooltipText}>Copy recent</span>
                    </div>
                  )}
                  <button className="pbtn" style={s.iconBtn} onClick={copyRecent}>
                    <NotesIcon />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Wave visual ── */

const BAR_COUNT = 10;

function WaveVisual({ state }: { state: string }) {
  const isRecording  = state === "recording";
  const isProcessing = state === "processing";

  const [levels, setLevels] = useState<number[]>(Array(BAR_COUNT).fill(0));
  const ctxRef      = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const rafRef      = useRef<number>(0);

  useEffect(() => {
    if (!isRecording) {
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
      ctxRef.current?.close();
      ctxRef.current    = null;
      analyserRef.current = null;
      streamRef.current = null;
      setLevels(Array(BAR_COUNT).fill(0));
      return;
    }

    navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      .then(stream => {
        streamRef.current = stream;
        const ctx = new AudioContext();
        ctxRef.current    = ctx;
        const analyser    = ctx.createAnalyser();
        analyser.fftSize  = 256;
        analyser.smoothingTimeConstant = 0.75;
        analyserRef.current = analyser;
        ctx.createMediaStreamSource(stream).connect(analyser);

        const data = new Uint8Array(analyser.frequencyBinCount); // 128 bins

        const tick = () => {
          analyser.getByteFrequencyData(data);
          // Sample BAR_COUNT evenly-spaced bins from the lower half (voice frequencies)
          const newLevels = Array.from({ length: BAR_COUNT }, (_, i) => {
            const bin = Math.floor((i / BAR_COUNT) * (data.length / 2));
            return data[bin] / 255; // 0–1
          });
          setLevels(newLevels);
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      })
      .catch(() => {
        // mic unavailable — levels stay at 0, bars stay static
      });

    return () => {
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
      ctxRef.current?.close();
    };
  }, [isRecording]);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2, height: 14 }}>
      {Array.from({ length: BAR_COUNT }).map((_, i) => {
        if (isRecording) {
          const level = levels[i];
          const h     = Math.max(0.15, level); // never fully flat
          return (
            <div key={i} style={{
              width: 1.5, height: "100%", borderRadius: 2,
              background: "rgba(167,139,250,0.9)",
              transformOrigin: "center",
              transform: `scaleY(${h})`,
              transition: "transform 0.05s ease-out",
            }} />
          );
        }
        if (isProcessing) return (
          <div key={i} style={{
            width: 2, height: 2, borderRadius: "50%",
            background: "rgba(251,191,36,0.85)",
            animation: "dotPulse 0.85s ease-in-out infinite",
            animationDelay: `${i * 0.07}s`,
          }} />
        );
        return <div key={i} style={{ width: 2, height: 2, borderRadius: "50%", background: "rgba(255,255,255,0.28)" }} />;
      })}
    </div>
  );
}

/* ── Icons ── */

function GlobeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M2 12h20"/>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2z"/>
    </svg>
  );
}

function WandIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72"/>
      <path d="m14 7 3 3"/>
      <path d="M5 6v4M19 14v4M10 2v2M7 8H3M21 16h-4M11 3H9"/>
    </svg>
  );
}

function NotesIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <line x1="10" y1="9"  x2="8" y2="9"/>
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="18 15 12 9 6 15"/>
    </svg>
  );
}

function LangCheck() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(167,139,250,0.9)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: "auto", flexShrink: 0 }}>
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(239,68,68,0.9)" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(34,197,94,0.9)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}

/* ── Styles ── */

const s: Record<string, React.CSSProperties> = {
  root: {
    width: "100vw", height: "100vh",
    display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "flex-end",
    paddingBottom: 5,
    background: "transparent",
    fontFamily: "'Inter', system-ui, sans-serif",
    gap: 5,
    pointerEvents: "none",
  },
  handle: {
    width: 40, height: 10, borderRadius: 99, flexShrink: 0,
    background: "#000",
    border: "1.5px solid rgba(255,255,255,0.55)",
    pointerEvents: "auto",
  },
  barRow: {
    display: "flex", alignItems: "center", gap: 5,
    background: "transparent",
    animation: "expandIn 0.18s cubic-bezier(.22,1,.36,1)",
    pointerEvents: "auto",
  },
  iconBtn: {
    display: "flex", alignItems: "center", justifyContent: "center",
    width: 32, height: 32, borderRadius: "50%",
    background: "rgba(8,8,16,0.92)",
    border: "1px solid rgba(255,255,255,0.13)",
    flexShrink: 0,
  },
  wavePill: {
    display: "flex", alignItems: "center", justifyContent: "center",
    height: 32, padding: "0 12px", borderRadius: 999,
    background: "rgba(8,8,16,0.92)",
    border: "1px solid rgba(255,255,255,0.13)",
    flexShrink: 0,
  },
  // Slides out from under the globe button to the left.
  // right:0 pins the drawer's right edge to the globe container's right edge.
  // The globe (zIndex:1) sits on top, revealing 10px of the drawer to its left.
  arrowDrawer: {
    display: "flex", alignItems: "center",
    justifyContent: "flex-start",
    paddingLeft: 7,
    width: 56, height: 32, borderRadius: 999,
    background: "rgba(70,70,82,0.94)",
    border: "1px solid rgba(255,255,255,0.12)",
    position: "absolute",
    right: 0,
    top: "50%",
    marginTop: -16,
    zIndex: 0,
    animation: "drawerWipe 0.2s cubic-bezier(.22,1,.36,1)",
  },
  langCode: {
    color: "rgba(255,255,255,0.9)", fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
    animation: "langPop 0.22s cubic-bezier(.34,1.56,.64,1)",
    display: "inline-block",
  },
  tooltip: {
    position: "absolute",
    bottom: "calc(100% + 8px)",
    left: "50%",
    transform: "translateX(-50%)",
    background: "rgba(8,8,16,0.95)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 10, padding: "6px 12px",
    whiteSpace: "nowrap" as const,
    display: "flex", alignItems: "center", gap: 5,
    boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
    zIndex: 30,
    animation: "fadeUp 0.13s ease forwards",
    pointerEvents: "none",
  },
  tooltipText: {
    color: "rgba(255,255,255,0.82)", fontSize: 12, fontWeight: 500,
  },
  langPanel: {
    position: "absolute",
    bottom: "calc(100% + 10px)",
    left: "50%",
    transform: "translateX(-50%)",
    background: "rgba(12,12,22,0.97)",
    backdropFilter: "blur(28px)",
    WebkitBackdropFilter: "blur(28px)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 14,
    paddingTop: 6, paddingBottom: 6,
    width: 230,
    boxShadow: "0 12px 40px rgba(0,0,0,0.7)",
    zIndex: 20,
    animation: "panelIn 0.18s cubic-bezier(.22,1,.36,1)",
    display: "flex", flexDirection: "column",
  },
  langRow: {
    display: "flex", alignItems: "center", gap: 10,
    padding: "7px 14px",
    background: "transparent",
    width: "100%", textAlign: "left" as const,
  },
  langRowFlag: { fontSize: 14, lineHeight: 1, flexShrink: 0 },
  langRowLabel: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: 500, flex: 1 },
  langDivider: { height: 1, background: "rgba(255,255,255,0.07)", margin: "4px 0" },
  langAction: {
    display: "flex", alignItems: "center",
    padding: "7px 14px",
    background: "transparent",
    color: "rgba(255,255,255,0.38)", fontSize: 12, fontWeight: 500,
    width: "100%", textAlign: "left" as const,
  },
};
