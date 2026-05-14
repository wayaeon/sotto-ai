import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useAppStore } from "./stores/appStore";
import Overlay from "./components/Overlay";

export default function App() {
  const setSidecarReady = useAppStore((s) => s.setSidecarReady);

  useEffect(() => {
    const unlisten = listen<string>("sidecar-event", (event) => {
      try {
        const msg = JSON.parse(event.payload);
        if (msg.event === "ready") {
          setSidecarReady(true);
        }
      } catch {
        // ignore malformed
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [setSidecarReady]);

  return <Overlay />;
}
