import { useEffect, useState } from "react";
import { useAppStore } from "./stores/appStore";
import { useSidecar } from "./hooks/useSidecar";
import SetupWizard from "./components/setup/SetupWizard";
import Home from "./components/Home";
import { hydrateLocalData } from "./lib/localData";

export default function App() {
  const { setupComplete, setSetupComplete, setTier, setModel } = useAppStore();
  const [localDataReady, setLocalDataReady] = useState(false);

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
    hydrateLocalData().finally(() => setLocalDataReady(true));
  }, []);

  useEffect(() => {
    if (setupComplete) localStorage.setItem("verba_setup_complete", "true");
  }, [setupComplete]);

  if (!localDataReady) return <div className="app-splash">Verba</div>;
  if (!setupComplete) return <SetupWizard onComplete={() => setSetupComplete(true)} />;

  return <Home />;
}
