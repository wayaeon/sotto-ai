import { isTauri } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";

export interface AvailableUpdate {
  currentVersion: string;
  version: string;
  notes: string;
  install: () => Promise<void>;
}

export function scheduleUpdateCheck(onUpdate: (update: AvailableUpdate) => void): () => void {
  let cancelled = false;
  const timer = window.setTimeout(async () => {
    if (!isTauri()) return;
    try {
      const update = await check({ timeout: 10_000 });
      if (!update || cancelled) return;
      onUpdate({
        currentVersion: update.currentVersion,
        version: update.version,
        notes: update.body?.trim() || "A newer version of Verba is ready.",
        install: async () => {
          await update.downloadAndInstall();
          await relaunch();
        },
      });
    } catch {
      // Update checks are opportunistic; a missing network or release must not
      // delay startup or affect local dictation.
    }
  }, 2_500);

  return () => {
    cancelled = true;
    window.clearTimeout(timer);
  };
}
