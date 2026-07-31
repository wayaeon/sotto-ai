import type { Transcription } from "./db";

export interface TranscriptAnalysis {
  transcription_id: number;
  analyzed_at: string;
  word_count: number;
  raw_word_count: number;
  filler_word_count: number;
  repeated_word_count: number;
  quality_flags: string[];
}

const ANALYSIS_KEY = "verba_transcript_analysis";
const MAX_ANALYSES = 200;
const FILLERS = new Set(["um", "umm", "uh", "uhh", "like", "actually", "basically", "literally"]);

function words(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\d'-]+/gu) ?? [];
}

function load(): TranscriptAnalysis[] {
  try {
    return JSON.parse(localStorage.getItem(ANALYSIS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function analyzeTranscript(transcription: Transcription): TranscriptAnalysis {
  const finalWords = words(transcription.text);
  const rawWords = words(transcription.raw_text ?? transcription.text);
  const fillerWordCount = rawWords.filter((word) => FILLERS.has(word)).length;
  const repeatedWordCount = finalWords.reduce(
    (count, word, index) => count + (index > 0 && word === finalWords[index - 1] ? 1 : 0),
    0,
  );
  const quality_flags: string[] = [];
  if (transcription.raw_text && transcription.raw_text.trim() !== transcription.text.trim()) quality_flags.push("postprocessed");
  if (repeatedWordCount > 0) quality_flags.push("repeated_words");
  if (finalWords.length > 0 && finalWords.length < 3) quality_flags.push("short_segment");

  return {
    transcription_id: transcription.id,
    analyzed_at: new Date().toISOString(),
    word_count: finalWords.length,
    raw_word_count: rawWords.length,
    filler_word_count: fillerWordCount,
    repeated_word_count: repeatedWordCount,
    quality_flags,
  };
}

export function saveTranscriptAnalysis(transcription: Transcription): TranscriptAnalysis {
  const analysis = analyzeTranscript(transcription);
  const next = [...load().filter((item) => item.transcription_id !== transcription.id), analysis];
  localStorage.setItem(ANALYSIS_KEY, JSON.stringify(next.slice(-MAX_ANALYSES)));
  return analysis;
}

export function getTranscriptAnalyses(): TranscriptAnalysis[] {
  return load();
}

/** Keep analysis off the dictation critical path. */
export function scheduleTranscriptAnalysis(transcription: Transcription): void {
  globalThis.setTimeout(() => saveTranscriptAnalysis(transcription), 0);
}
