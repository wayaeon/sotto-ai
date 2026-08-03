import { useEffect, useState } from "react";
import { useAppStore } from "./stores/appStore";
import { useSidecar } from "./hooks/useSidecar";
import SetupWizard from "./components/setup/SetupWizard";
import Home from "./components/Home";
import { hydrateLocalData } from "./lib/localData";
import UpdateNotice from "./components/UpdateNotice";
import { scheduleUpdateCheck, type AvailableUpdate } from "./lib/updater";

export default function App() {
  const { setupComplete, setSetupComplete, setTier, setModel } = useAppStore();
  const [localDataReady, setLocalDataReady] = useState(false);
  const [availableUpdate, setAvailableUpdate] = useState<AvailableUpdate | null>(null);

  useSidecar();

  useEffect(() => scheduleUpdateCheck(setAvailableUpdate), []);

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

  const content = !localDataReady
    ? <div className="app-splash">Verba</div>
    : !setupComplete
      ? <SetupWizard onComplete={() => setSetupComplete(true)} />
      : <Home />;

  return (
    <>
      {availableUpdate && (
        <UpdateNotice update={availableUpdate} onDismiss={() => setAvailableUpdate(null)} />
      )}
      {content}
    </>
  );
}
