import { useEffect } from "react";
import { useAppStore } from "./stores/appStore";
import { useSidecar } from "./hooks/useSidecar";
import SetupWizard from "./components/setup/SetupWizard";
import Home from "./components/Home";

export default function App() {
  const { setupComplete, setSetupComplete, setTier, setModel } = useAppStore();

  useSidecar();

  // Rehydrate persisted state
  useEffect(() => {
    if (localStorage.getItem("verba_setup_complete") === "true") setSetupComplete(true);
    const t = localStorage.getItem("verba_tier");
    const m = localStorage.getItem("verba_model");
    if (t) setTier(t as any);
    if (m) setModel(m);
  }, []);

  useEffect(() => {
    if (setupComplete) localStorage.setItem("verba_setup_complete", "true");
  }, [setupComplete]);

  if (!setupComplete) return <SetupWizard onComplete={() => setSetupComplete(true)} />;

  return <Home />;
}
