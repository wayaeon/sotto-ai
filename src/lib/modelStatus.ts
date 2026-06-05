export interface ModelDownloadStatusInput {
  active: boolean;
  downloaded: boolean;
  downloading: boolean;
  paused: boolean;
  downloadSupported: boolean;
}

export interface ModelDownloadStatus {
  label: string;
  icon: string;
  color: string;
  background: string;
  borderColor: string;
}

export function modelDownloadStatus({
  active,
  downloaded,
  downloading,
  paused,
  downloadSupported,
}: ModelDownloadStatusInput): ModelDownloadStatus {
  if (active && downloaded) {
    return {
      label: "Active · downloaded",
      icon: "●",
      color: "#818cf8",
      background: "rgba(129,140,248,0.14)",
      borderColor: "rgba(129,140,248,0.34)",
    };
  }

  if (downloaded) {
    return {
      label: "Downloaded",
      icon: "✓",
      color: "#34d399",
      background: "rgba(52,211,153,0.10)",
      borderColor: "rgba(52,211,153,0.28)",
    };
  }

  if (downloading) {
    return {
      label: paused ? "Paused" : "Downloading",
      icon: paused ? "Ⅱ" : "↓",
      color: paused ? "#fbbf24" : "#a78bfa",
      background: paused ? "rgba(245,158,11,0.10)" : "rgba(167,139,250,0.10)",
      borderColor: paused ? "rgba(245,158,11,0.28)" : "rgba(167,139,250,0.28)",
    };
  }

  if (!downloadSupported) {
    return {
      label: "Unavailable",
      icon: "!",
      color: "#f59e0b",
      background: "rgba(245,158,11,0.10)",
      borderColor: "rgba(245,158,11,0.28)",
    };
  }

  return {
    label: "Not downloaded",
    icon: "○",
    color: "#64748b",
    background: "rgba(100,116,139,0.08)",
    borderColor: "rgba(100,116,139,0.22)",
  };
}
