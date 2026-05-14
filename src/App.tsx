import { useAppStore } from "./stores/appStore";
import { useSidecar } from "./hooks/useSidecar";
import Overlay from "./components/Overlay";
import SetupWizard from "./components/setup/SetupWizard";

export default function App() {
  const { setupComplete } = useAppStore();

  useSidecar();

  if (!setupComplete) {
    return <SetupWizard onComplete={() => {}} />;
  }

  return <Overlay />;
}
