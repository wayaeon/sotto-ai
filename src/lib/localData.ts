import { loadLocalData, saveLocalData } from "./tauri";

export interface VocabularyEntry {
  id: string;
  term: string;
  phonetic?: string;
  category?: "name" | "concept" | "term" | "general";
  context?: string;
  proficiency?: "learning" | "familiar" | "fluent";
}

export interface CorrectionRule {
  id: string;
  from: string;
  to: string;
  scope: "all" | "current-app";
  appName?: string | null;
  created_at: string;
}

interface DurableData {
  version: 1;
  transcriptions: unknown[];
  vocabulary: VocabularyEntry[];
  correction_rules: CorrectionRule[];
  metrics: Record<string, string>;
}

const DATA_VERSION = 1 as const;
const TRANSCRIPTIONS_KEY = "verba_transcriptions";
const VOCABULARY_KEY = "verba_dictionary";
const CORRECTIONS_KEY = "verba_correction_rules";
const METRIC_KEYS = ["verba_total_words", "verba_sessions", "verba_streak", "verba_avg_wpm", "verba_total_ms", "verba_last_day"];
let persistQueue = Promise.resolve();

function parse<T>(value: string | null, fallback: T): T {
  try { return value ? JSON.parse(value) as T : fallback; } catch { return fallback; }
}

function localSnapshot(): DurableData {
  const metrics: Record<string, string> = {};
  for (const key of METRIC_KEYS) {
    const value = localStorage.getItem(key);
    if (value !== null) metrics[key] = value;
  }
  return {
    version: DATA_VERSION,
    transcriptions: parse(localStorage.getItem(TRANSCRIPTIONS_KEY), []),
    vocabulary: parse(localStorage.getItem(VOCABULARY_KEY), []),
    correction_rules: parse(localStorage.getItem(CORRECTIONS_KEY), []),
    metrics,
  };
}

function mergeById<T extends { id: number | string }>(primary: T[], secondary: T[]): T[] {
  const merged = new Map<string, T>();
  for (const item of primary) merged.set(String(item.id), item);
  for (const item of secondary) merged.set(String(item.id), item);
  return [...merged.values()];
}

export function persistLocalData(): Promise<void> {
  const write = persistQueue.then(async () => {
    try { await saveLocalData(JSON.stringify(localSnapshot())); } catch { /* browser dev mode or unavailable Tauri */ }
  });
  persistQueue = write.catch(() => {});
  return write;
}

export async function hydrateLocalData(): Promise<void> {
  const local = localSnapshot();
  let durable: DurableData | null = null;
  try { durable = parse<DurableData | null>(await loadLocalData(), null); } catch { /* first run/browser dev mode */ }

  if (!durable || durable.version !== DATA_VERSION) {
    await persistLocalData();
    return;
  }

  const transcriptions = mergeById(durable.transcriptions as Array<{ id: number }>, local.transcriptions as Array<{ id: number }>);
  const vocabulary = mergeById(durable.vocabulary, local.vocabulary);
  const correctionRules = mergeById(durable.correction_rules, local.correction_rules);
  localStorage.setItem(TRANSCRIPTIONS_KEY, JSON.stringify(transcriptions));
  localStorage.setItem(VOCABULARY_KEY, JSON.stringify(vocabulary));
  localStorage.setItem(CORRECTIONS_KEY, JSON.stringify(correctionRules));
  for (const [key, value] of Object.entries({ ...durable.metrics, ...local.metrics })) localStorage.setItem(key, value);
  await persistLocalData();
}

export function getVocabulary(): VocabularyEntry[] {
  return parse(localStorage.getItem(VOCABULARY_KEY), []);
}

export function saveVocabulary(entries: VocabularyEntry[]): void {
  localStorage.setItem(VOCABULARY_KEY, JSON.stringify(entries));
  void persistLocalData();
}

export function getCorrectionRules(): CorrectionRule[] {
  return parse(localStorage.getItem(CORRECTIONS_KEY), []);
}

export function saveCorrectionRules(rules: CorrectionRule[]): void {
  localStorage.setItem(CORRECTIONS_KEY, JSON.stringify(rules));
  void persistLocalData();
}
