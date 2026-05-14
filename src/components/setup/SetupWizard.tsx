import { useState } from "react";
import { useAppStore } from "../../stores/appStore";
import HardwareScan from "./HardwareScan";
import ModelDownload from "./ModelDownload";
import TestRecording from "./TestRecording";
import LicenseStep from "./LicenseStep";

type Step = "hardware" | "download" | "test" | "license";

interface Props {
  onComplete: () => void;
}

export default function SetupWizard({ onComplete }: Props) {
  const [step, setStep] = useState<Step>("hardware");
  const { setSetupComplete } = useAppStore();

  const finish = () => {
    setSetupComplete(true);
    onComplete();
  };

  const stepIndex = { hardware: 0, download: 1, test: 2, license: 3 }[step];
  const steps = ["Hardware", "Model", "Test", "License"];

  return (
    <div style={styles.root}>
      <div style={styles.card}>
        <div style={styles.header}>
          <span style={styles.logo}>🎙</span>
          <h1 style={styles.title}>Wispr Local Setup</h1>
        </div>

        <div style={styles.stepBar}>
          {steps.map((s, i) => (
            <div key={s} style={{ display: "flex", alignItems: "center" }}>
              <div
                style={{
                  ...styles.stepDot,
                  background: i <= stepIndex ? "#6366f1" : "#3f3f50",
                }}
              >
                {i < stepIndex ? "✓" : i + 1}
              </div>
              <span style={{ ...styles.stepLabel, opacity: i === stepIndex ? 1 : 0.5 }}>
                {s}
              </span>
              {i < steps.length - 1 && <div style={styles.stepLine} />}
            </div>
          ))}
        </div>

        <div style={styles.content}>
          {step === "hardware" && (
            <HardwareScan onNext={() => setStep("download")} />
          )}
          {step === "download" && (
            <ModelDownload onNext={() => setStep("test")} />
          )}
          {step === "test" && (
            <TestRecording onNext={() => setStep("license")} />
          )}
          {step === "license" && (
            <LicenseStep onComplete={finish} />
          )}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100vw",
    height: "100vh",
    background: "#0f0f17",
    fontFamily: "system-ui, sans-serif",
  },
  card: {
    background: "#1a1a2e",
    borderRadius: 16,
    padding: "32px 40px",
    width: 520,
    boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
    border: "1px solid rgba(255,255,255,0.06)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 28,
  },
  logo: { fontSize: 28 },
  title: { margin: 0, color: "#fff", fontSize: 20, fontWeight: 600 },
  stepBar: {
    display: "flex",
    alignItems: "center",
    marginBottom: 32,
    gap: 4,
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    fontSize: 12,
    fontWeight: 600,
    flexShrink: 0,
  },
  stepLabel: {
    color: "#fff",
    fontSize: 12,
    marginLeft: 6,
    marginRight: 4,
    whiteSpace: "nowrap",
  },
  stepLine: {
    flex: 1,
    height: 1,
    background: "rgba(255,255,255,0.12)",
    margin: "0 4px",
    minWidth: 16,
  },
  content: { color: "#e0e0e0" },
};
