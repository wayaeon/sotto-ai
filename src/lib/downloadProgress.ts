export interface DownloadProgressState {
  progress: Record<string, number>;
  labels: Record<string, string>;
  paused: Record<string, boolean>;
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
}

export function applyDownloadProgress(
  state: DownloadProgressState,
  msg: DownloadProgressMessage,
): DownloadProgressState {
  const progress = { ...state.progress };
  const labels = { ...state.labels };
  const paused = { ...state.paused };

  if (msg.checked && msg.downloaded === false) {
    delete progress[msg.model];
    delete labels[msg.model];
    delete paused[msg.model];
    return { progress, labels, paused };
  }

  progress[msg.model] = msg.percent;
  paused[msg.model] = !!msg.paused && msg.percent < 100;

  if (msg.downloaded_label || msg.total_label) {
    labels[msg.model] = `${msg.downloaded_label ?? "0 B"} / ${msg.total_label ?? "unknown"}`;
  }

  return { progress, labels, paused };
}
