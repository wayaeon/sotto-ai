export interface DownloadProgressState {
  progress: Record<string, number>;
  labels: Record<string, string>;
  paused: Record<string, boolean>;
  etaLabels: Record<string, string>;
  samples: Record<string, DownloadProgressSample>;
}

export interface DownloadProgressSample {
  bytesDownloaded: number;
  atMs: number;
  bytesPerSecond?: number;
  firstAtMs?: number;
  sampleCount?: number;
  lastEtaAtMs?: number;
  lastEtaLabel?: string;
}

export interface DownloadProgressMessage {
  model: string;
  percent: number;
  bytes_downloaded?: number;
  bytes_total?: number;
  downloaded_label?: string;
  total_label?: string;
  paused?: boolean;
  checked?: boolean;
  downloaded?: boolean;
  failed?: boolean;
}

function formatEta(seconds: number): string {
  const rounded = Math.max(1, Math.round(seconds));
  if (rounded < 60) return `${rounded}s left`;
  if (rounded < 3600) {
    const minutes = Math.floor(rounded / 60);
    const remainingSeconds = rounded % 60;
    return remainingSeconds ? `${minutes}m ${remainingSeconds}s left` : `${minutes}m left`;
  }
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.round((rounded % 3600) / 60);
  return minutes ? `${hours}h ${minutes}m left` : `${hours}h left`;
}

function formatDownloadBytes(bytesValue: number, role: "downloaded" | "total"): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytesValue;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  if (unit === 0) return `${Math.round(value)} ${units[unit]}`;
  if (units[unit] === "GB") {
    return `${role === "downloaded" ? value.toFixed(3) : value.toFixed(1)} ${units[unit]}`;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

const ETA_MIN_SAMPLE_COUNT = 4;
const ETA_MIN_WINDOW_MS = 5000;
const ETA_UPDATE_INTERVAL_MS = 5000;

export function applyDownloadProgress(
  state: DownloadProgressState,
  msg: DownloadProgressMessage,
  nowMs = Date.now(),
): DownloadProgressState {
  const progress = { ...state.progress };
  const labels = { ...state.labels };
  const paused = { ...state.paused };
  const etaLabels = { ...(state.etaLabels ?? {}) };
  const samples = { ...(state.samples ?? {}) };

  const clearModel = () => {
    delete progress[msg.model];
    delete labels[msg.model];
    delete paused[msg.model];
    delete etaLabels[msg.model];
    delete samples[msg.model];
  };

  if (msg.failed) {
    clearModel();
    return { progress, labels, paused, etaLabels, samples };
  }

  const existingProgress = progress[msg.model];
  const hasActiveDownload = existingProgress !== undefined && existingProgress < 100;

  if (msg.checked && msg.downloaded === false && !hasActiveDownload) {
    clearModel();
    return { progress, labels, paused, etaLabels, samples };
  }

  if (msg.checked && msg.downloaded === false && hasActiveDownload) {
    return { progress, labels, paused, etaLabels, samples };
  }

  progress[msg.model] = msg.percent;
  paused[msg.model] = !!msg.paused && msg.percent < 100;

  if (
    msg.bytes_downloaded !== undefined
    || msg.bytes_total !== undefined
    || msg.downloaded_label
    || msg.total_label
  ) {
    const downloadedLabel = msg.bytes_downloaded !== undefined
      ? formatDownloadBytes(msg.bytes_downloaded, "downloaded")
      : msg.downloaded_label ?? "0 B";
    const totalLabel = msg.bytes_total !== undefined
      ? formatDownloadBytes(msg.bytes_total, "total")
      : msg.total_label ?? "unknown";
    labels[msg.model] = `${downloadedLabel} / ${totalLabel}`;
  }

  const bytesDownloaded = msg.bytes_downloaded;
  const bytesTotal = msg.bytes_total;
  if (
    msg.percent >= 100
    || msg.downloaded
    || bytesDownloaded === undefined
    || bytesTotal === undefined
    || bytesTotal <= 0
    || bytesDownloaded <= 0
    || bytesDownloaded >= bytesTotal
  ) {
    delete etaLabels[msg.model];
    delete samples[msg.model];
    return { progress, labels, paused, etaLabels, samples };
  }

  const previous = samples[msg.model];
  if (previous) {
    const elapsedSeconds = (nowMs - previous.atMs) / 1000;
    const bytesDelta = bytesDownloaded - previous.bytesDownloaded;
    if (elapsedSeconds > 0 && bytesDelta > 0) {
      const instantRate = bytesDelta / elapsedSeconds;
      const bytesPerSecond = previous.bytesPerSecond
        ? previous.bytesPerSecond * 0.85 + instantRate * 0.15
        : instantRate;
      const firstAtMs = previous.firstAtMs ?? previous.atMs;
      const sampleCount = (previous.sampleCount ?? 1) + 1;
      const remainingSeconds = (bytesTotal - bytesDownloaded) / bytesPerSecond;
      let lastEtaAtMs = previous.lastEtaAtMs;
      let lastEtaLabel = previous.lastEtaLabel;
      const hasStableWindow = sampleCount >= ETA_MIN_SAMPLE_COUNT && nowMs - firstAtMs >= ETA_MIN_WINDOW_MS;
      const canUpdateEta = !lastEtaAtMs || nowMs - lastEtaAtMs >= ETA_UPDATE_INTERVAL_MS;
      if (hasStableWindow && canUpdateEta && Number.isFinite(remainingSeconds) && remainingSeconds > 0) {
        lastEtaLabel = formatEta(remainingSeconds);
        lastEtaAtMs = nowMs;
        etaLabels[msg.model] = lastEtaLabel;
      } else if (lastEtaLabel) {
        etaLabels[msg.model] = lastEtaLabel;
      }
      samples[msg.model] = {
        bytesDownloaded,
        atMs: nowMs,
        bytesPerSecond,
        firstAtMs,
        sampleCount,
        lastEtaAtMs,
        lastEtaLabel,
      };
    }
  } else {
    samples[msg.model] = { bytesDownloaded, atMs: nowMs, firstAtMs: nowMs, sampleCount: 1 };
  }

  return { progress, labels, paused, etaLabels, samples };
}
