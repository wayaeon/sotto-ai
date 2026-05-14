import { useEffect, useState } from "react";
import { useAppStore } from "./stores/appStore";
import { useSidecar } from "./hooks/useSidecar";
import Overlay from "./components/Overlay";
import SetupWizard from "./components/setup/SetupWizard";

export default function App() {
  const { setupComplete, sidecarReady } = useAppStore();
  const [showSetup, setShowSetup] = useState(false);

  useSidecar();

  useEffect(() => {
    // Show setup if not completed after sidecar ready
    if (sidecarReady && !setupComplete) {
      setShowSetup(true);
    }
  }, [sidecarReady, setupComplete]);

  if (showSetup && !setupComplete) {
    return <SetupWizard onComplete={() => setShowSetup(false)} />;
  }

  return <Overlay />;
}
