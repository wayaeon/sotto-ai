export interface Transcription {
  id: number;
  text: string;
  model: string;
  tier: string;
  duration_ms: number;
  created_at: string;
  app_name: string | null;
  app_icon: string | null;
}

const TRANSCRIPTIONS_KEY = "verba_transcriptions";
const MAX_STORED = 200;

function load(): Transcription[] {
  try {
    return JSON.parse(localStorage.getItem(TRANSCRIPTIONS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

let _nextId = Date.now();

export function insertTranscription(
  text: string,
  model: string,
  tier: string,
  durationMs: number,
  appName: string | null = null,
  appIcon: string | null = null
): Transcription {
  const items = load();
  const item: Transcription = {
    id: _nextId++,
    text,
    model: model ?? "",
    tier: tier ?? "",
    duration_ms: durationMs,
    created_at: new Date().toISOString(),
    app_name: appName,
    app_icon: appIcon,
  };
  items.push(item);
  localStorage.setItem(TRANSCRIPTIONS_KEY, JSON.stringify(items.slice(-MAX_STORED)));
  return item;
}

export function getTranscriptions(limit = 50): Transcription[] {
  return load().slice(-limit).reverse();
}

export function updateMetrics(wordCount: number, durationMs: number): void {
  const totalWords = parseInt(localStorage.getItem("verba_total_words") ?? "0") + wordCount;
  localStorage.setItem("verba_total_words", String(totalWords));

  const sessions = parseInt(localStorage.getItem("verba_sessions") ?? "0") + 1;
  localStorage.setItem("verba_sessions", String(sessions));

  const today = new Date().toDateString();
  const lastDay = localStorage.getItem("verba_last_day");
  if (lastDay !== today) {
    const yesterday = new Date(Date.now() - 86_400_000).toDateString();
    const streak = parseInt(localStorage.getItem("verba_streak") ?? "0");
    localStorage.setItem(
      "verba_streak",
      String(lastDay === yesterday ? streak + 1 : 1)
    );
    localStorage.setItem("verba_last_day", today);
  }

  const totalMs = parseInt(localStorage.getItem("verba_total_ms") ?? "0") + durationMs;
  localStorage.setItem("verba_total_ms", String(totalMs));
  const wpm = totalMs > 0 ? Math.round((totalWords / totalMs) * 60_000) : 0;
  localStorage.setItem("verba_avg_wpm", String(wpm));
}
