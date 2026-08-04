import { useState } from "react";
import type { AvailableUpdate } from "../lib/updater";

interface UpdateNoticeProps {
  update: AvailableUpdate;
  onDismiss: () => void;
}

export default function UpdateNotice({ update, onDismiss }: UpdateNoticeProps) {
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState(false);

  async function install() {
    setInstalling(true);
    setError(false);
    try {
      await update.install();
    } catch {
      setInstalling(false);
      setError(true);
    }
  }

  return (
    <aside className="update-notice" role="status" aria-live="polite">
      <div className="update-notice-copy">
        <span className="update-notice-kicker">VERBA UPDATE</span>
        <strong>{error ? "Update could not be installed" : `Version ${update.version} is ready`}</strong>
        {!error && <span>{update.notes}</span>}
      </div>
      {!error && (
        <button className="update-notice-install" type="button" onClick={install} disabled={installing}>
          {installing ? "Installing…" : "Install update"}
        </button>
      )}
      <button className="update-notice-dismiss" type="button" onClick={onDismiss} aria-label="Dismiss update notice">
        ×
      </button>
    </aside>
  );
}
