import React, { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { currentMonitor, getCurrentWindow, PhysicalPosition, PhysicalSize } from "@tauri-apps/api/window";
import { useAppStore } from "../stores/appStore";
import { useSidecar } from "../hooks/useSidecar";
import { toggleHandsfree } from "../lib/tauri";

const LANGUAGES = [
  { code: "EN", label: "English",            flag: "🇺🇸" },
  { code: "ES", label: "Spanish (Español)",  flag: "🇪🇸" },
  { code: "FR", label: "French (Français)",  flag: "🇫🇷" },
];

// Right side = notes(32). Left side must match so wavepill lands at exact center.
const SIDE_W = 32;
const PILL_WINDOW_W           = 380;
const PILL_WINDOW_COLLAPSED_W = 60;
const PILL_WINDOW_COLLAPSED_H = 56;
const PILL_WINDOW_BAR_H       = 124;
const PILL_WINDOW_ACTIVE_H    = 136;
const PILL_WINDOW_PANEL_H     = 380;

const ANIM_IN_MS  = 100;
const ANIM_OUT_MS = 50;

// PillPhase drives which surfaces are visible.
// The key invariant: handle is ONLY visible in "collapsed".
// This prevents the handle from re-appearing inside the old expanded window.
type PillPhase = "collapsed" | "expanding" | "expanded" | "collapsing";
type Hovered   = null | "lang" | "dictate" | "history";

// Monitor cache — avoids a redundant IPC call on every resize.
let monitorCache: Awaited<ReturnType<typeof currentMonitor>> | undefined;

async function resizePillWindow(width: number, height: number) {
  const win = getCurrentWindow();
  if (monitorCache === undefined) monitorCache = await currentMonitor() ?? null;
  const monitor = monitorCache;
  const scale   = monitor?.scaleFactor ?? await win.scaleFactor();

  const widthPx  = Math.round(width  * scale);
  const heightPx = Math.round(height * scale);

  const x = monitor
    ? monitor.workArea.position.x + Math.round((monitor.workArea.size.width - widthPx) / 2)
    : 0;
  const y = monitor
    ? monitor.workArea.position.y + monitor.workArea.size.height - heightPx
    : 0;

  // Parallel IPC — setSize + setPosition in one overlapped round-trip.
  await Promise.all([
    win.setSize(new PhysicalSize(widthPx, heightPx)),
    monitor ? win.setPosition(new PhysicalPosition(x, y)) : Promise.resolve(),
  ]);
}

export default function Pill() {
  useSidecar({ primary: true });
  const { recordingState, sidecarReady, modelReady, setRecordingState, handsFreeActive, focusedApp } = useAppStore();

  const leaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [bottomPad,     setBottomPad]     = useState(52);
  const [phase,         setPhase]         = useState<PillPhase>("collapsed");
  const [barMounted,    setBarMounted]    = useState(false);
  const [barIn,         setBarIn]         = useState(false);
  const [hoveredEl,     setHoveredEl]     = useState<Hovered>(null);
  const [expanded,      setExpanded]      = useState(false);
  const [langIdx,       setLangIdx]       = useState(-1);
  const [showLangPanel, setShowLangPanel] = useState(false);
  const [activeLangs,   setActiveLangs]   = useState<Set<string>>(new Set(["EN", "ES"]));

  // Refs so async callbacks never read stale closure values.
  const phaseRef     = useRef<PillPhase>("collapsed");
  const expandGenRef = useRef(0);

  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background            = "transparent";
    const root = document.getElementById("root");
    if (root) root.style.background = "transparent";
    setBottomPad(10);
  }, []);

  const isRecording  = recordingState === "recording";
  const isProcessing = recordingState === "processing";
  const isLoading    = recordingState === "loading";
  // Hands-free keeps the bar up the whole time it's armed, not just mid-utterance —
  // this is the pill's half of staying in sync with the Orb's persistent "listening"
  // state instead of going silent between utterances.
  const isListening   = handsFreeActive && !isRecording && !isProcessing;
  const shouldShowBar = expanded || isRecording || isProcessing || isLoading || handsFreeActive;

  // ─── Phase state machine ──────────────────────────────────────────────────
  //
  // EXPAND path:
  //   1. Immediately: phase → "expanding", barMounted=true.
  //      Handle starts fading out right away (phase !== "collapsed") for
  //      instant visual response before the resize IPC completes.
  //   2. Await resize (window at correct position before any pixel moves).
  //   3. rAF → barIn=true, phase → "expanded".
  //
  // COLLAPSE path:
  //   1. Immediately: phase → "collapsing", barIn=false (CSS exit starts).
  //      Handle stays hidden (phase !== "collapsed") — no jump.
  //   2. After ANIM_OUT_MS: unmount bar, resize window.
  //   3. After resize: phase → "collapsed". Only NOW does the handle appear.
  //
  // This guarantees the handle is NEVER visible inside the expanded window.
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const targetHeight = showLangPanel
      ? PILL_WINDOW_PANEL_H
      : isRecording || isProcessing || isLoading || isListening
        ? PILL_WINDOW_ACTIVE_H
        : PILL_WINDOW_BAR_H;

    if (shouldShowBar) {
      // Already expanded/expanding — just resize for height change (no gen bump).
      if (phaseRef.current === "expanded" || phaseRef.current === "expanding") {
        resizePillWindow(PILL_WINDOW_W, targetHeight).catch(() => {});
        return;
      }

      // Collapsed or collapsing → full expand.
      const gen = ++expandGenRef.current;
      phaseRef.current = "expanding";
      setPhase("expanding");
      setBarMounted(true);
      setBarIn(false); // bar starts transparent; resize must finish before fade-in

      resizePillWindow(PILL_WINDOW_W, targetHeight)
        .then(() => {
          if (expandGenRef.current !== gen) return;
          // One rAF is enough — bar has been mounted for the full resize duration.
          requestAnimationFrame(() => {
            if (expandGenRef.current !== gen) return;
            setBarIn(true);
            phaseRef.current = "expanded";
            setPhase("expanded");
          });
        })
        .catch(() => {
          if (expandGenRef.current !== gen) return;
          requestAnimationFrame(() => {
            if (expandGenRef.current !== gen) return;
            setBarIn(true);
            phaseRef.current = "expanded";
            setPhase("expanded");
          });
        });

    } else {
      // Already collapsed/collapsing — nothing to do.
      if (phaseRef.current === "collapsed" || phaseRef.current === "collapsing") return;

      // Expanded or expanding → collapse.
      const gen = ++expandGenRef.current;
      phaseRef.current = "collapsing";
      setPhase("collapsing");
      setBarIn(false); // start CSS exit transition

      const t = setTimeout(async () => {
        if (expandGenRef.current !== gen) return;
        setBarMounted(false);
        // Resize while handle is still hidden (phase = "collapsing").
        await resizePillWindow(PILL_WINDOW_COLLAPSED_W, PILL_WINDOW_COLLAPSED_H).catch(() => {});
        // Only after window is at collapsed size does the handle appear.
        if (expandGenRef.current !== gen) return;
        phaseRef.current = "collapsed";
        setPhase("collapsed");
      }, ANIM_OUT_MS);

      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldShowBar, isRecording, isProcessing, isLoading, isListening, showLangPanel]);

  // Recording timer
  const [recSecs, setRecSecs] = useState(0);
  const recStartRef = useRef<number | null>(null);
  useEffect(() => {
    if (isRecording) {
      recStartRef.current = Date.now();
      setRecSecs(0);
      const id = setInterval(() => {
        setRecSecs(Math.floor((Date.now() - recStartRef.current!) / 1000));
      }, 500);
      return () => clearInterval(id);
    } else {
      recStartRef.current = null;
    }
  }, [isRecording]);

  const allActive = langIdx === -1;

  const scheduleHide = () => {
    leaveTimer.current = setTimeout(() => {
      setExpanded(false);
      setHoveredEl(null);
      setShowLangPanel(false);
    }, 150);
  };
  const cancelHide = () => clearTimeout(leaveTimer.current);

  // Click toggles hands-free, same as the Orb — Ctrl+Win stays the instant
  // one-shot PTT path (wired directly in Rust, doesn't go through here).
  const onDictateClick = () => {
    if (!sidecarReady || !modelReady) return;
    toggleHandsfree().catch(() => {});
  };
  const cancelRecording = async () => {
    setRecordingState("idle");
    if (sidecarReady) await invoke("stop_ptt").catch(() => {});
  };
  const copyRecent = async () => {
    const text = localStorage.getItem("verba_last_transcription") ?? "";
    if (text) navigator.clipboard.writeText(text).catch(() => {});
  };

  const cycleLang = () => {
    const active = LANGUAGES.filter(l => activeLangs.has(l.code));
    if (active.length === 0) return;
    if (langIdx === -1) {
      setLangIdx(LANGUAGES.findIndex(l => l.code === active[0].code));
    } else {
      const cur = LANGUAGES[langIdx].code;
      const idx = active.findIndex(l => l.code === cur);
      if (idx === active.length - 1) {
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

  const isCollapsed = phase === "collapsed";
  const barEnter    = `opacity ${ANIM_IN_MS}ms cubic-bezier(0.22,1,0.36,1), transform ${ANIM_IN_MS}ms cubic-bezier(0.22,1,0.36,1)`;
  const barExit     = `opacity ${ANIM_OUT_MS}ms ease-in, transform ${ANIM_OUT_MS}ms ease-in`;
  const handleTx    = `opacity ${ANIM_IN_MS}ms cubic-bezier(0.22,1,0.36,1), transform ${ANIM_IN_MS}ms cubic-bezier(0.22,1,0.36,1)`;

  return (
    <div style={s.root}>
      <style>{`
        * { cursor: default !important; }

        @media (prefers-reduced-motion: reduce) {
          * { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
        }

        @keyframes dotPulse {
          0%, 100% { opacity: 0.2; }
          50%       { opacity: 0.85; }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateX(-50%) translateY(4px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes panelIn {
          from { opacity: 0; transform: translateX(-50%) translateY(5px) scale(0.97); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
        }
        @keyframes drawerWipe {
          from { clip-path: inset(0 0 0 100%); }
          to   { clip-path: inset(0 0 0 0%); }
        }
        @keyframes langPop {
          0%   { opacity: 0; transform: scale(0.65); }
          60%  { transform: scale(1.08); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes pulseGlow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(167,139,250,0); }
          50%       { box-shadow: 0 0 0 6px rgba(167,139,250,0.18); }
        }
        @keyframes pulseGlowMint {
          0%, 100% { box-shadow: 0 0 0 0 rgba(52,211,153,0); }
          50%       { box-shadow: 0 0 0 6px rgba(52,211,153,0.16); }
        }
        @keyframes micPulse {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50%       { opacity: 1; transform: scale(1.15); }
        }

        .pbtn { outline: none; border: none; }
        .pbtn:active { transform: scale(0.9); }
      `}</style>

      {/*
        Single anchor point — both handle and bar are absolutely positioned
        relative to this element. They share the same bottom-center origin,
        so they can never push each other around in flex flow.
      */}
      <div style={{ ...s.anchor, bottom: bottomPad }}>

        {/* ── Collapsed handle ────────────────────────────────────────────
            Visible ONLY in "collapsed" phase.
            During any other phase it is hidden and non-interactive —
            including during "collapsing", so it cannot jump above the
            exiting bar while the window is still expanded.
        ─────────────────────────────────────────────────────────────────── */}
        <div
          style={{
            ...s.handle,
            opacity:       isCollapsed ? 1 : 0,
            transform:     isCollapsed
              ? "translateX(-50%) scale(1)"
              : "translateX(-50%) scale(0.78)",
            // Snap OFF instantly when expanding so the handle never teleports
            // while 100vw changes during the Tauri window resize.
            // Only animate ON (fade in) when returning to collapsed.
            transition:    isCollapsed ? handleTx : "none",
            pointerEvents: isCollapsed ? "auto" : "none",
          }}
          onMouseEnter={() => { cancelHide(); setExpanded(true); }}
          onMouseLeave={scheduleHide}
        />

        {/* ── Expanded bar ─────────────────────────────────────────────── */}
        {barMounted && (
          <div
            style={{
              ...s.barRow,
              opacity:    barIn ? 1 : 0,
              transform:  barIn
                ? "translateX(-50%) translateY(0) scale(1)"
                : "translateX(-50%) translateY(6px) scale(0.96)",
              transition: barIn ? barEnter : barExit,
              pointerEvents: barMounted ? "auto" : "none",
            }}
            onMouseEnter={cancelHide}
            onMouseLeave={scheduleHide}
          >

            {isLoading ? (
              <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 8 }}>
                <div style={s.dictatingBubble}>
                  <span style={{ ...s.dictatingDot, background: "rgba(251,191,36,0.9)", animation: "dotPulse 1s ease-in-out infinite" }} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    <span style={s.dictatingText}>
                      Loading transcription model…
                    </span>
                  </div>
                </div>
                <button className="pbtn" style={{ ...s.iconBtn, border: "1px solid rgba(239,68,68,0.35)" }} onClick={cancelRecording}>
                  <XIcon />
                </button>
                <div style={{ ...s.wavePill, border: "1px solid rgba(251,191,36,0.4)", minWidth: 100 }}>
                  <WaveVisual state="processing" />
                </div>
              </div>

            ) : isRecording || isProcessing ? (
              <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 8 }}>
                <button className="pbtn" style={{ ...s.iconBtn, border: "1px solid rgba(239,68,68,0.35)" }} onClick={cancelRecording}>
                  <XIcon />
                </button>
                <div style={{
                  ...s.wavePill,
                  border: isRecording ? "1px solid rgba(167,139,250,0.6)" : "1px solid rgba(251,191,36,0.4)",
                  animation: isRecording ? "pulseGlow 1.8s ease-in-out infinite" : "none",
                  minWidth: 100, gap: 8,
                }}>
                  {isRecording && focusedApp?.iconDataUri && (
                    <img src={focusedApp.iconDataUri} alt="" title={focusedApp.name} style={s.appIcon} />
                  )}
                  {isRecording && (
                    <span style={s.recTimer}>
                      {`${Math.floor(recSecs / 60)}:${String(recSecs % 60).padStart(2, "0")}`}
                    </span>
                  )}
                  <WaveVisual state={recordingState} />
                </div>
                <button className="pbtn" style={{ ...s.iconBtn, border: "1px solid rgba(34,197,94,0.35)" }} onClick={() => invoke("stop_ptt").catch(() => {})}>
                  <CheckIcon />
                </button>
              </div>

            ) : isListening ? (
              <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ ...s.dictatingBubble, border: "1px solid rgba(52,211,153,0.25)" }}>
                  <span style={{ ...s.dictatingDot, background: "rgba(52,211,153,0.9)", animation: "micPulse 1.6s ease-in-out infinite" }} />
                  <span style={s.dictatingText}>Listening…</span>
                </div>
                <button
                  className="pbtn"
                  style={{ ...s.wavePill, border: "1px solid rgba(52,211,153,0.5)", animation: "pulseGlowMint 2.2s ease-in-out infinite", minWidth: 100 }}
                  onClick={onDictateClick}
                >
                  <WaveVisual state="idle" />
                </button>
              </div>

            ) : (
              <>
                {/* LEFT — globe / lang */}
                <div style={{ width: SIDE_W, display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
                  <div
                    style={{ position: "relative", display: "inline-flex", alignItems: "center" }}
                    onMouseEnter={() => setHoveredEl("lang")}
                    onMouseLeave={() => setHoveredEl(null)}
                  >
                    {hoveredEl === "lang" && !showLangPanel && (
                      <div style={s.tooltip}><span style={s.tooltipText}>Change language</span></div>
                    )}
                    {hoveredEl === "lang" && (
                      <button className="pbtn" style={s.arrowDrawer} onClick={() => setShowLangPanel(p => !p)}>
                        <ChevronIcon />
                      </button>
                    )}
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
                    {showLangPanel && (
                      <div style={s.langPanel} onMouseEnter={cancelHide}>
                        {LANGUAGES.map(lang => (
                          <button key={lang.code} className="pbtn" style={s.langRow} onClick={() => toggleLang(lang.code)}>
                            <span style={s.langRowFlag}>{lang.flag}</span>
                            <span style={s.langRowLabel}>{lang.label}</span>
                            {activeLangs.has(lang.code) && <LangCheck />}
                          </button>
                        ))}
                        <div style={s.langDivider} />
                        <button className="pbtn" style={s.langAction}
                          onClick={() => setActiveLangs(new Set(LANGUAGES.map(l => l.code)))}>
                          Enable all
                        </button>
                        <button className="pbtn" style={s.langAction}>Add more</button>
                      </div>
                    )}
                  </div>
                </div>

                {/* CENTER — dictate */}
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
                  <button className="pbtn" style={s.wavePill} onClick={onDictateClick}>
                    <WaveVisual state={recordingState} />
                  </button>
                </div>

                {/* RIGHT — notes */}
                <div style={{ width: SIDE_W, display: "flex", alignItems: "center" }}>
                  <div
                    style={{ position: "relative" }}
                    onMouseEnter={() => setHoveredEl("history")}
                    onMouseLeave={() => setHoveredEl(null)}
                  >
                    {hoveredEl === "history" && (
                      <div style={s.tooltip}><span style={s.tooltipText}>Copy recent</span></div>
                    )}
                    <button className="pbtn" style={s.iconBtn} onClick={copyRecent}><NotesIcon /></button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
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
      ctxRef.current     = null;
      analyserRef.current = null;
      streamRef.current  = null;
      setLevels(Array(BAR_COUNT).fill(0));
      return;
    }

    navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      .then(stream => {
        streamRef.current = stream;
        const ctx         = new AudioContext();
        ctxRef.current    = ctx;
        const analyser    = ctx.createAnalyser();
        analyser.fftSize  = 256;
        analyser.smoothingTimeConstant = 0.75;
        analyserRef.current = analyser;
        ctx.createMediaStreamSource(stream).connect(analyser);

        const data = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteFrequencyData(data);
          const newLevels = Array.from({ length: BAR_COUNT }, (_, i) => {
            const bin = Math.floor((i / BAR_COUNT) * (data.length / 2));
            return data[bin] / 255;
          });
          setLevels(newLevels);
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      })
      .catch(() => {});

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
          const h = Math.max(0.15, levels[i]);
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
        return (
          <div key={i} style={{
            width: 2, height: 2, borderRadius: "50%",
            background: "rgba(255,255,255,0.28)",
          }} />
        );
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
    // position: relative so the absolute anchor is contained within it.
    // No flex layout — handle + bar use absolute positioning via anchor.
    width: "100vw", height: "100vh",
    position: "relative",
    background: "transparent",
    fontFamily: "'Inter', system-ui, sans-serif",
    pointerEvents: "none",
    overflow: "visible",
  },
  // Single anchor: a zero-size absolute point at bottom-center.
  // Both handle and bar are absolutely positioned inside it, sharing
  // the same bottom-center origin. They cannot push each other in flow.
  anchor: {
    position: "absolute",
    left: "50%",
    // bottom is set inline with `bottomPad`.
    width: 0,
    height: 0,
    pointerEvents: "none",
    overflow: "visible",
  },
  handle: {
    // Absolutely positioned relative to anchor (bottom-center).
    position: "absolute",
    left: 0,
    bottom: 0,
    width: 40, height: 10,
    borderRadius: 99,
    background: "#000",
    border: "1.5px solid rgba(255,255,255,0.55)",
    // transform + opacity driven inline; transition set inline too.
    transformOrigin: "center bottom",
    // Horizontal centering via translateX(-50%) baked into inline transform.
  },
  barRow: {
    // Absolutely positioned relative to anchor (bottom-center).
    position: "absolute",
    left: 0,
    bottom: 0,
    display: "flex",
    alignItems: "center",
    gap: 5,
    background: "transparent",
    // transform + opacity driven inline.
    transformOrigin: "center bottom",
    // Horizontal centering via translateX(-50%) baked into inline transform.
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
  langRowFlag:  { fontSize: 14, lineHeight: 1, flexShrink: 0 },
  langRowLabel: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: 500, flex: 1 },
  langDivider:  { height: 1, background: "rgba(255,255,255,0.07)", margin: "4px 0" },
  langAction: {
    display: "flex", alignItems: "center",
    padding: "7px 14px",
    background: "transparent",
    color: "rgba(255,255,255,0.38)", fontSize: 12, fontWeight: 500,
    width: "100%", textAlign: "left" as const,
  },
  dictatingBubble: {
    position: "absolute" as const,
    bottom: "calc(100% + 10px)",
    left: "50%",
    transform: "translateX(-50%)",
    background: "rgba(10,10,20,0.96)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    border: "1px solid rgba(167,139,250,0.25)",
    borderRadius: 12,
    padding: "6px 14px",
    display: "flex", alignItems: "center", gap: 7,
    whiteSpace: "nowrap" as const,
    boxShadow: "0 4px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(167,139,250,0.08)",
    zIndex: 30,
    animation: "fadeUp 0.18s cubic-bezier(.22,1,.36,1) forwards",
    pointerEvents: "none" as const,
  },
  dictatingDot: {
    display: "inline-block",
    width: 7, height: 7, borderRadius: "50%",
    background: "rgba(167,139,250,0.9)",
    flexShrink: 0,
    animation: "micPulse 1.2s ease-in-out infinite",
  } as React.CSSProperties,
  dictatingText: {
    color: "rgba(255,255,255,0.88)", fontSize: 12, fontWeight: 600, letterSpacing: 0.1,
  },
  recTimer: {
    color: "rgba(167,139,250,0.9)", fontSize: 12, fontWeight: 600,
    fontVariantNumeric: "tabular-nums", letterSpacing: 0.5, flexShrink: 0,
  },
  appIcon: {
    width: 14, height: 14, borderRadius: 3, flexShrink: 0, objectFit: "contain",
  },
  progressTrack: {
    width: 180, height: 3, borderRadius: 99,
    background: "rgba(255,255,255,0.1)", overflow: "hidden",
  },
  progressFill: {
    height: "100%", borderRadius: 99,
    background: "linear-gradient(90deg, rgba(167,139,250,0.9), rgba(251,191,36,0.9))",
    transition: "width 0.4s ease",
  },
};
