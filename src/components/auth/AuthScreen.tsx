import React, { useState } from "react";
import { supabase } from "../../lib/supabase";

interface Props { onAuth: () => void; }
type Mode = "signin" | "signup";

export default function AuthScreen({ onAuth }: Props) {
  const [mode, setMode]           = useState<Mode>("signin");
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [name, setName]           = useState("");
  const [showPw, setShowPw]       = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [resetSent, setResetSent]       = useState(false);
  const [confirmPending, setConfirmPending] = useState(false);

  const sendReset = async () => {
    if (!email) { setError("Enter your email first"); return; }
    setLoading(true); setError("");
    const { error: e } = await supabase.auth.resetPasswordForEmail(email);
    setLoading(false);
    if (e) setError(e.message); else setResetSent(true);
  };

  const submit = async () => {
    if (!email || !password) return;
    setLoading(true); setError("");
    try {
      if (mode === "signup") {
        const { data, error: e } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name } } });
        if (e) throw e;
        if (!data.session) { setConfirmPending(true); setLoading(false); return; }
      } else {
        const { error: e } = await supabase.auth.signInWithPassword({ email, password });
        if (e) throw e;
      }
      onAuth();
    } catch (e: any) {
      setError(e.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={s.root}>
      <style>{`
        @keyframes fadeUp   { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
        @keyframes orb1     { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(30px,-20px) scale(1.08)} }
        @keyframes orb2     { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-20px,25px) scale(1.05)} }
        @keyframes wave     { 0%{transform:scaleY(0.4)} 100%{transform:scaleY(1)} }
        .ai { animation: fadeUp 0.55s cubic-bezier(.22,1,.36,1) both; }
        .ai2 { animation: fadeUp 0.55s cubic-bezier(.22,1,.36,1) 0.08s both; }
        .auth-input { display:block; width:100%; box-sizing:border-box; }
        .auth-input:focus { border-color: rgba(139,92,246,0.8) !important; outline:none; box-shadow:0 0 0 3px rgba(139,92,246,0.18) !important; }
        .auth-btn { transition: opacity 0.2s ease !important; }
        .auth-btn:hover:not(:disabled) { opacity: 0.88 !important; }
        .auth-btn:active:not(:disabled) { opacity: 0.72 !important; }
        .mode-tab:hover { color:rgba(255,255,255,0.65) !important; }
        .forgot:hover { color:rgba(196,181,253,0.9) !important; }
      `}</style>

      {/* Ambient orbs */}
      <div style={{ ...s.orb, ...s.orb1 }} />
      <div style={{ ...s.orb, ...s.orb2 }} />
      <div style={{ ...s.orb, ...s.orb3 }} />

      {/* Left brand panel */}
      <div style={s.brand}>
        {/* Subtle dot grid */}
        <div style={s.dotGrid} />

        <div className="ai" style={s.brandInner}>
          {/* Wordmark logo */}
          <img src="/Sotto Logo transparent background.png" style={s.brandWordmark} alt="Sotto" />

          {/* Waveform */}
          <div style={s.waveRow}>
            {[2,4,7,11,8,15,10,18,14,20,16,12,19,13,17,9,15,11,7,13,10,16,8,12,6,9,4,7,3,5].map((h, i) => (
              <div key={i} style={{
                ...s.waveBar,
                height: h,
                opacity: 0.12 + (h / 20) * 0.55,
                animationDelay: `${i * 0.05}s`,
              }} />
            ))}
          </div>

          {/* Tagline */}
          <div style={s.brandTagline}>Speak. It appears.</div>

          {/* Feature list */}
          <div style={s.features}>
            {[
              { dot: "◆", text: "Transcribes in real time" },
              { dot: "◆", text: "Runs entirely on-device" },
              { dot: "◆", text: "Types into any app" },
            ].map(f => (
              <div key={f.text} style={s.featureRow}>
                <span style={s.featureDot}>{f.dot}</span>
                <span style={s.featureText}>{f.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Divider */}
      <div style={s.divider} />

      {/* Right form panel */}
      <div style={s.formPanel}>
        <div className="ai2" style={s.formInner}>
          {confirmPending ? (
            <div style={s.confirmBox}>
              <div style={s.confirmIcon}>✉️</div>
              <div style={s.confirmTitle}>Check your email</div>
              <div style={s.confirmSub}>
                We sent a confirmation link to<br />
                <strong style={{ color: "rgba(255,255,255,0.7)" }}>{email}</strong>.<br />
                Click it to activate your account, then sign in.
              </div>
              <button style={s.confirmBack} onClick={() => { setConfirmPending(false); setMode("signin"); }}>
                Back to sign in
              </button>
            </div>
          ) : <>
          <div style={s.formTitle}>
            {mode === "signin" ? "Welcome back" : "Get started"}
          </div>
          <div style={s.formSub}>
            {mode === "signin" ? "Sign in to your Sotto account" : "Create your free account"}
          </div>

          {/* Tabs */}
          <div style={s.tabs}>
            {(["signin","signup"] as Mode[]).map(m => (
              <button key={m} className="mode-tab"
                style={{ ...s.tab, ...(mode === m ? s.tabActive : {}) }}
                onClick={() => { setMode(m); setError(""); setResetSent(false); }}>
                {m === "signin" ? "Sign in" : "Sign up"}
              </button>
            ))}
          </div>

          <div style={s.fields}>
            {mode === "signup" && (
              <Field label="Full name">
                <input className="auth-input" style={s.input} type="text"
                  placeholder="Your name" value={name} onChange={e => setName(e.target.value)} />
              </Field>
            )}
            <Field label="Email">
              <input className="auth-input" style={s.input} type="email"
                placeholder="you@email.com" value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === "Enter" && submit()} />
            </Field>
            <Field label="Password">
              <div style={{ position: "relative" }}>
                <input className="auth-input"
                  style={{ ...s.input, paddingRight: 44 }}
                  type={showPw ? "text" : "password"} placeholder="••••••••"
                  value={password} onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && submit()} />
                <button type="button" tabIndex={-1}
                  onClick={() => setShowPw(v => !v)} style={s.eyeBtn}>
                  {showPw ? <EyeOff /> : <Eye />}
                </button>
              </div>
            </Field>
          </div>

          {error && <div style={s.error}>{error}</div>}

          <button className="auth-btn" style={{ ...s.btn, opacity: loading ? 0.65 : 1 }}
            onClick={submit} disabled={loading}>
            {loading
              ? <span style={s.spinner}>●</span>
              : mode === "signup" ? "Create account" : "Sign in"}
          </button>

          {mode === "signin" && (
            <div style={{ textAlign: "center" as const, marginTop: 14 }}>
              {resetSent
                ? <span style={s.resetSent}>Reset link sent — check your inbox ✓</span>
                : <button className="forgot" style={s.forgotBtn}
                    onClick={sendReset} disabled={loading}>
                    Forgot password?
                  </button>
              }
            </div>
          )}

          <p style={s.legal}>
            By continuing you agree to Sotto's{" "}
            <a href="https://sotto.app/terms" target="_blank" rel="noreferrer" style={s.legalLink}>
              terms of service
            </a>.
          </p>
          </>}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <label style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase" as const }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Eye() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  );
}

function EyeOff() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}

const s: Record<string, React.CSSProperties> = {
  root: {
    width: "100%", height: "100%",
    display: "flex", flexDirection: "row",
    fontFamily: "'Inter', system-ui, sans-serif",
    background: "linear-gradient(135deg, #0d0618 0%, #100d22 40%, #0a0f1e 100%)",
    position: "relative", overflow: "hidden",
  },

  orb: {
    position: "absolute", borderRadius: "50%",
    filter: "blur(90px)", pointerEvents: "none",
  },
  orb1: {
    width: 420, height: 420,
    background: "radial-gradient(circle, rgba(124,58,237,0.45) 0%, rgba(109,40,217,0.2) 60%, transparent 100%)",
    top: -100, left: -80, animation: "orb1 10s ease-in-out infinite",
  },
  orb2: {
    width: 360, height: 360,
    background: "radial-gradient(circle, rgba(79,70,229,0.3) 0%, rgba(67,56,202,0.15) 60%, transparent 100%)",
    bottom: -80, left: "25%", animation: "orb2 13s ease-in-out infinite",
  },
  orb3: {
    width: 300, height: 300,
    background: "radial-gradient(circle, rgba(139,92,246,0.25) 0%, rgba(109,40,217,0.1) 60%, transparent 100%)",
    top: "20%", right: -60, animation: "orb1 8s ease-in-out infinite reverse",
  },

  brand: {
    flex: "0 0 44%",
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: "40px 36px",
    position: "relative", overflow: "hidden",
    background: "#000",
  },
  dotGrid: {
    position: "absolute", inset: 0, pointerEvents: "none",
    backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)",
    backgroundSize: "22px 22px",
    maskImage: "radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 100%)",
    WebkitMaskImage: "radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 100%)",
  } as React.CSSProperties,
  brandInner: {
    display: "flex", flexDirection: "column", alignItems: "center",
    textAlign: "center",
    position: "relative", zIndex: 1,
  },
  brandWordmark: {
    width: 210, height: "auto",
    marginBottom: 10,
  },
  brandTagline: {
    fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1,
    marginBottom: 20, fontWeight: 400, letterSpacing: 2,
    textTransform: "uppercase" as const, textAlign: "center" as const,
  },
  waveRow: {
    display: "flex", alignItems: "center", gap: 2.5,
    marginBottom: 18, height: 24, width: "90%", justifyContent: "center",
  },
  waveBar: {
    width: 3, borderRadius: 99,
    background: "linear-gradient(to top, rgba(139,92,246,0.6), rgba(196,181,253,0.9))",
    animation: "wave 1.2s ease-in-out infinite alternate",
    flexShrink: 0,
  },
  features: { display: "flex", flexDirection: "column", gap: 9, alignItems: "flex-start" },
  featureRow: { display: "flex", alignItems: "center", gap: 10 },
  featureDot: {
    fontSize: 6, color: "rgba(167,139,250,0.9)", flexShrink: 0,
    width: 14, textAlign: "center" as const, lineHeight: 1,
  },
  featureText: {
    fontSize: 12.5, color: "rgba(255,255,255,0.58)", fontWeight: 400,
    letterSpacing: 0.2, lineHeight: 1,
  },

  divider: {
    width: 1, alignSelf: "stretch", margin: "28px 0",
    background: "linear-gradient(to bottom, transparent, rgba(255,255,255,0.07) 20%, rgba(255,255,255,0.07) 80%, transparent)",
    flexShrink: 0,
  },

  formPanel: {
    flex: 1,
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: "40px 36px",
  },
  formInner: { width: "100%", maxWidth: 300 },

  formTitle: {
    fontSize: 22, fontWeight: 700, color: "#fff",
    letterSpacing: -0.4, marginBottom: 4,
  },
  formSub: {
    fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 20,
  },

  tabs: {
    display: "flex", gap: 2,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 10, padding: 3, marginBottom: 18,
  },
  tab: {
    flex: 1, background: "transparent", border: "none",
    color: "rgba(255,255,255,0.3)", fontSize: 12, fontWeight: 500,
    padding: "7px 0", borderRadius: 8, cursor: "pointer", transition: "all 0.15s",
  },
  tabActive: {
    background: "rgba(139,92,246,0.22)",
    color: "#c4b5fd",
  },

  fields: { display: "flex", flexDirection: "column", gap: 14, marginBottom: 18 },
  input: {
    background: "rgba(255,255,255,0.045)",
    border: "1px solid rgba(139,92,246,0.18)",
    borderRadius: 9, color: "#fff", fontSize: 13.5,
    padding: "10px 12px",
    transition: "border-color 0.15s, box-shadow 0.15s",
  },
  eyeBtn: {
    position: "absolute" as const, right: 12, top: "50%",
    transform: "translateY(-50%)",
    background: "transparent", border: "none", cursor: "pointer",
    color: "rgba(255,255,255,0.3)", display: "flex", alignItems: "center", padding: 2,
  },
  error: {
    background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
    borderRadius: 9, color: "#fca5a5", fontSize: 12, padding: "9px 12px", marginBottom: 12,
  },
  btn: {
    width: "100%", background: "linear-gradient(135deg, #6d28d9, #7c3aed)",
    color: "#fff", border: "none", borderRadius: 10,
    padding: "11px 0", fontSize: 14, fontWeight: 600, cursor: "pointer",
    willChange: "transform, box-shadow, filter",
    boxShadow: "0 4px 20px rgba(109,40,217,0.45)",
    letterSpacing: 0.2,
  },
  spinner: { animation: "orb1 0.8s linear infinite", display: "inline-block" },
  forgotBtn: {
    background: "transparent", border: "none",
    color: "rgba(196,181,253,0.45)", fontSize: 12, cursor: "pointer",
    padding: 0, transition: "color 0.15s",
  },
  resetSent: { color: "#4ade80", fontSize: 12 },
  legal: {
    color: "rgba(255,255,255,0.35)", fontSize: 11, textAlign: "center" as const,
    marginTop: 20, lineHeight: 1.6,
  },
  confirmBox: {
    display: "flex", flexDirection: "column", alignItems: "center",
    textAlign: "center" as const, gap: 12, paddingTop: 8,
  },
  confirmIcon: { fontSize: 36, marginBottom: 4 },
  confirmTitle: { fontSize: 20, fontWeight: 700, color: "#fff", letterSpacing: -0.3 },
  confirmSub: {
    fontSize: 13, color: "rgba(255,255,255,0.45)", lineHeight: 1.7,
  },
  confirmBack: {
    marginTop: 8, background: "transparent",
    border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8,
    color: "rgba(255,255,255,0.45)", fontSize: 12, padding: "8px 20px",
    cursor: "pointer", transition: "border-color 0.2s, color 0.2s",
  },
  legalLink: {
    color: "rgba(167,139,250,0.8)", textDecoration: "underline",
    textUnderlineOffset: 2, cursor: "pointer",
  },
};
