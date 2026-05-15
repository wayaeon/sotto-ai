import { useState } from "react";
import { useAppStore } from "../../stores/appStore";
import HardwareScan from "./HardwareScan";
import ModelDownload from "./ModelDownload";
import PlanSelection from "./PlanSelection";
import PermissionsStep from "./PermissionsStep";
import TranscriptionTest from "./TranscriptionTest";
import ReadyScreen from "./ReadyScreen";

type Step = "hardware" | "plan" | "download" | "permissions" | "test" | "ready";
const STEPS: Step[] = ["hardware", "plan", "download", "permissions", "test", "ready"];

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
    <div style={{
      width: "100%", height: "100%",
      background: "var(--bg)",
      display: "flex", flexDirection: "column",
      position: "relative", overflow: "hidden",
    }}>
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Top progress bar */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0,
        height: 2, background: "var(--border)",
      }}>
        <div style={{
          height: "100%",
          background: "var(--grad-spectrum)",
          width: `${((stepIndex + 1) / STEPS.length) * 100}%`,
          transition: "width 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
          borderRadius: "0 2px 2px 0",
        }} />
      </div>

      {/* Step counter */}
      <div style={{
        position: "absolute", top: 16, right: 20,
        color: "var(--text-4)", fontSize: 11, fontWeight: 500,
        letterSpacing: 1, fontFamily: "var(--font-mono)",
      }}>
        {stepIndex + 1} / {STEPS.length}
      </div>

      {/* Content area */}
      <div key={step} style={{
        flex: 1,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "48px 56px 40px",
        animation: "fadeUp 0.45s cubic-bezier(0.4, 0, 0.2, 1)",
      }}>
        {step === "hardware"     && <HardwareScan      onNext={() => setStep("plan")} />}
        {step === "plan"         && <PlanSelection     onNext={() => setStep("download")} />}
        {step === "download"     && <ModelDownload     onNext={() => setStep("permissions")} />}
        {step === "permissions"  && <PermissionsStep   onNext={() => setStep("test")} />}
        {step === "test"         && <TranscriptionTest onNext={() => setStep("ready")} />}
        {step === "ready"        && <ReadyScreen       onComplete={finish} />}
      </div>
    </div>
  );
}
