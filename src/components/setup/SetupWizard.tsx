import { useState } from "react";
import { useAppStore } from "../../stores/appStore";
import HardwareScan from "./HardwareScan";
import ModelDownload from "./ModelDownload";
import TestRecording from "./TestRecording";
import LicenseStep from "./LicenseStep";

type Step = "hardware" | "download" | "test" | "license";
const STEPS: Step[] = ["hardware", "download", "test", "license"];

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

  const stepIndex = STEPS.indexOf(step);

  return (
    <div style={s.root}>
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Top progress bar */}
      <div style={s.progressTrack}>
        <div style={{ ...s.progressFill, width: `${((stepIndex + 1) / STEPS.length) * 100}%` }} />
      </div>

      {/* Step counter */}
      <div style={s.stepCounter}>{stepIndex + 1} / {STEPS.length}</div>

      {/* Content area */}
      <div key={step} style={s.content}>
        {step === "hardware" && <HardwareScan onNext={() => setStep("download")} />}
        {step === "download" && <ModelDownload onNext={() => setStep("test")} />}
        {step === "test"     && <TestRecording onNext={() => setStep("license")} />}
        {step === "license"  && <LicenseStep onComplete={finish} />}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  root: {
    width: "100%",
    height: "100%",
    background: "#0a0a12",
    display: "flex",
    flexDirection: "column",
    fontFamily: "'Inter', system-ui, sans-serif",
    position: "relative",
    overflow: "hidden",
  },
  progressTrack: {
    position: "absolute",
    top: 0, left: 0, right: 0,
    height: 2,
    background: "rgba(255,255,255,0.06)",
  },
  progressFill: {
    height: "100%",
    background: "linear-gradient(90deg, #6366f1, #a78bfa)",
    transition: "width 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
    borderRadius: "0 2px 2px 0",
  },
  stepCounter: {
    position: "absolute",
    top: 16,
    right: 20,
    color: "rgba(255,255,255,0.2)",
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: 1,
  },
  content: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "48px 56px 40px",
    animation: "fadeUp 0.45s cubic-bezier(0.4, 0, 0.2, 1)",
  },
};
