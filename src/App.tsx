import { useEffect, useState } from "react";
import { useAppStore } from "./stores/appStore";
import { useSidecar } from "./hooks/useSidecar";
import { supabase } from "./lib/supabase";
import type { Session } from "@supabase/supabase-js";
import AuthScreen from "./components/auth/AuthScreen";
import SetupWizard from "./components/setup/SetupWizard";
import Home from "./components/Home";

export default function App() {
  const { setupComplete, setSetupComplete, setTier, setModel } = useAppStore();
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useSidecar();

  // Auth state
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  // Rehydrate persisted state
  useEffect(() => {
    if (localStorage.getItem("sotto_setup_complete") === "true") setSetupComplete(true);
    const t = localStorage.getItem("sotto_tier");
    const m = localStorage.getItem("sotto_model");
    if (t) setTier(t as any);
    if (m) setModel(m);
  }, []);

  useEffect(() => {
    if (setupComplete) localStorage.setItem("sotto_setup_complete", "true");
  }, [setupComplete]);

  // Still checking auth
  if (session === undefined) return <Loader />;

  // Not signed in
  if (!session) return <AuthScreen onAuth={() => setSession(undefined)} />;

  // Signed in but setup not done
  if (!setupComplete) return <SetupWizard onComplete={() => setSetupComplete(true)} />;

  return <Home />;
}

function Loader() {
  return (
    <div style={{
      width: "100%", height: "100%", display: "flex",
      alignItems: "center", justifyContent: "center",
      background: "#0a0a12",
    }}>
      <img src="/Sotto Icon.png" style={{ width: 40, height: 40, borderRadius: 10, opacity: 0.6 }} alt="" />
    </div>
  );
}
