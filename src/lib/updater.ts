import { isTauri } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";

const STATUS_KEY = "verba_update_status";
const STATUS_EVENT = "verba:update-status";
const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;

export interface UpdateStatus {
  currentVersion: string;
  lastCheckedAt: number | null;
  lastUpdatedAt: number | null;
  availableVersion: string | null;
  checkError: string | null;
}

export interface AvailableUpdate {
  currentVersion: string;
  version: string;
  notes: string;
  install: () => Promise<void>;
}

const DEFAULT_STATUS: UpdateStatus = {
  currentVersion: "dev",
  lastCheckedAt: null,
  lastUpdatedAt: null,
  availableVersion: null,
  checkError: null,
};

export function readUpdateStatus(): UpdateStatus {
  try {
    const stored = JSON.parse(localStorage.getItem(STATUS_KEY) ?? "null") as Partial<UpdateStatus> | null;
    return {
      ...DEFAULT_STATUS,
      ...stored,
      lastCheckedAt: typeof stored?.lastCheckedAt === "number" ? stored.lastCheckedAt : null,
      lastUpdatedAt: typeof stored?.lastUpdatedAt === "number" ? stored.lastUpdatedAt : null,
      availableVersion: typeof stored?.availableVersion === "string" ? stored.availableVersion : null,
      checkError: typeof stored?.checkError === "string" ? stored.checkError : null,
    };
  } catch {
    return DEFAULT_STATUS;
  }
}

function writeUpdateStatus(status: UpdateStatus): void {
  localStorage.setItem(STATUS_KEY, JSON.stringify(status));
  window.dispatchEvent(new Event(STATUS_EVENT));
}

export function subscribeToUpdateStatus(listener: () => void): () => void {
  window.addEventListener(STATUS_EVENT, listener);
  return () => window.removeEventListener(STATUS_EVENT, listener);
}

async function getInstalledVersion(): Promise<string> {
  if (!isTauri()) return "dev";
  try {
    return await getVersion();
  } catch {
    return "unknown";
  }
}

export async function checkForUpdate(): Promise<Awaited<ReturnType<typeof check>> | null> {
  if (!isTauri()) return null;

  const currentVersion = await getInstalledVersion();
  const previous = readUpdateStatus();
  const previousVersion = localStorage.getItem("verba_update_current_version");
  const lastUpdatedAt = previousVersion && previousVersion !== currentVersion
    ? Date.now()
    : previous.lastUpdatedAt;
  localStorage.setItem("verba_update_current_version", currentVersion);

  try {
    const update = await check({ timeout: 10_000 });
    writeUpdateStatus({
      currentVersion,
      lastCheckedAt: Date.now(),
      lastUpdatedAt,
      availableVersion: update?.version ?? null,
      checkError: null,
    });
    return update;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeUpdateStatus({
      ...previous,
      currentVersion,
      lastCheckedAt: Date.now(),
      lastUpdatedAt,
      checkError: message.slice(0, 180),
    });
    throw error;
  }
}

export function scheduleUpdateCheck(onUpdate: (update: AvailableUpdate) => void): () => void {
  let cancelled = false;
  let notifiedVersion: string | null = null;
  let interval: number | null = null;

  async function runCheck() {
    if (cancelled || !isTauri()) return;
    try {
      const update = await checkForUpdate();
      if (!update || cancelled || notifiedVersion === update.version) return;
      notifiedVersion = update.version;
      const status = readUpdateStatus();
      onUpdate({
        currentVersion: status.currentVersion,
        version: update.version,
        notes: update.body?.trim() || "A newer version of Verba is ready.",
        install: async () => {
          await update.downloadAndInstall();
          const latest = readUpdateStatus();
          writeUpdateStatus({ ...latest, currentVersion: update.version, lastUpdatedAt: Date.now(), availableVersion: null, checkError: null });
          await relaunch();
        },
      });
    } catch {
      // Update checks are opportunistic; a missing network or release must not
      // delay startup or affect local dictation.
    }
  }

  const timer = window.setTimeout(async () => {
    await runCheck();
    if (!cancelled && isTauri()) interval = window.setInterval(runCheck, UPDATE_CHECK_INTERVAL_MS);
  }, 2_500);

  return () => {
    cancelled = true;
    window.clearTimeout(timer);
    if (interval !== null) window.clearInterval(interval);
  };
}
